/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');
const http = require('../../lib/http');
const { makeRouter } = require('./helpers');

let mockAgent;
let originalDispatcher;

beforeEach(() => {
	originalDispatcher = getGlobalDispatcher();
	mockAgent = new MockAgent();
	mockAgent.disableNetConnect();
	setGlobalDispatcher(mockAgent);
	// https: probe requests (insecure:true) use an explicit per-request dispatcher that
	// bypasses setGlobalDispatcher() - redirect it at the same MockAgent for these tests
	http._setInsecureDispatcherForTesting(mockAgent);
});

afterEach(() => {
	http._setInsecureDispatcherForTesting(null);
	setGlobalDispatcher(originalDispatcher);
});

const currentSettingBody = (extra = '') => `Model=R7800\nFirmware=V1.0.2.60WW\nSOAPVersion=3.43\nLoginMethod=2.0\n${extra}`;

const soapPortOkResponse = () => '<v:Envelope><v:Body><ResponseCode>0</ResponseCode></v:Body></v:Envelope>';

test('getCurrentSetting parses fields and skips SOAP-port probing when SOAP_HTTPs_Port is present', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody('SOAP_HTTPs_Port=443\n'));
	// no probe interceptors registered at all - if getCurrentSetting tried to probe anyway,
	// disableNetConnect() would make those requests throw and the test would fail

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.Model, 'R7800');
	assert.equal(currentSetting.port, '443');
	assert.equal(currentSetting.tls, true);
	assert.equal(router.loginMethod, 2);
	// SOAPVersion is parsed with parseInt (not parseFloat) in the original code, truncating '3.43' to 3
	assert.equal(router.soapVersion, 3);
});

test('getCurrentSetting probes all SOAP ports concurrently and picks the responder (non-TLS)', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());
	// 443/5043/5555 (tls) and 80 are left unmocked - every candidate is now probed concurrently
	// (not stopped early), so those requests do fire, but disableNetConnect()'s rejection is
	// caught internally by _probeSoapEndpoint and just resolves to "no response" for that port
	mockAgent.get('http://192.168.1.1:5000').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, soapPortOkResponse());

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.port, 5000);
	assert.equal(currentSetting.tls, false);
});

test('getCurrentSetting picks the earliest-priority candidate (443) even when a later one also responds', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());
	// note: no explicit :443 here - the URL's default https port is normalized away, so
	// undici's MockAgent origin matching requires registering the bare origin instead
	mockAgent.get('https://192.168.1.1').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, soapPortOkResponse());
	// port 80 also responds - with all candidates probed concurrently, 443 must still win
	// because it's earlier in the priority list, not because 80 was never tried
	mockAgent.get('http://192.168.1.1').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, soapPortOkResponse());

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.port, 443);
	assert.equal(currentSetting.tls, true);
});

test('getCurrentSetting rejects when nothing at the host looks like a Netgear router', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, 'not a router response');

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	await assert.rejects(router.getCurrentSetting('192.168.1.1'), /not a valid Netgear router/);
});

test('getCurrentSetting rejects on a non-200 HTTP status', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' }).reply(500, 'error');

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	await assert.rejects(router.getCurrentSetting('192.168.1.1'), /HTTP request Failed. Status Code: 500/);
});

test('_getSoapPort returns undefined when no candidate port responds', async () => {
	// no probe interceptors registered at all -> every candidate is rejected by disableNetConnect
	const router = makeRouter();
	const port = await router._getSoapPort('192.168.1.1');
	assert.equal(port, undefined);
});
