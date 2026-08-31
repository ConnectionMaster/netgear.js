/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
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

test('getCurrentSetting falls back to an https port when http:80 cannot connect', async () => {
	// http://192.168.1.1:80 left unmocked -> disableNetConnect() makes it a connection error
	mockAgent.get('https://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody('SOAP_HTTPs_Port=443\n'));

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.port, '443');
	assert.equal(currentSetting.tls, true);
	assert.equal(router.loginMethod, 2);
});

test('getCurrentSetting does NOT fall back to https when http:80 gives a definitive response', async () => {
	// :80 answers with a non-router body; the https ports would 200 but must never be tried
	mockAgent.get('http://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, 'not a router response');
	mockAgent.get('https://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody('SOAP_HTTPs_Port=443\n'));

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	await assert.rejects(router.getCurrentSetting('192.168.1.1'), /not a valid Netgear router/);
});

test('getCurrentSetting honours httpsFallback:false (the network-scan path)', async () => {
	// :80 unreachable; even though an https port would answer, fallback is disabled -> reject
	mockAgent.get('https://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody('SOAP_HTTPs_Port=443\n'));

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	// the :80 connection failure is what must surface - not a later probe's error, and not
	// some unrelated throw, which an unmatched assert.rejects() would happily accept
	await assert.rejects(
		router.getCurrentSetting('192.168.1.1', undefined, { httpsFallback: false }),
		(error) => /fetch failed/.test(error.message) && /http:\/\/192\.168\.1\.1/.test(String(error.cause)),
	);
});

test('getCurrentSetting keeps probing past an https port that answers with a non-router page', async () => {
	// the HTTPS-only Orbi case: :80 refused, :443 serves the web-UI login page, and the real
	// currentsetting.htm lives on :5555. A response on a fallback port is not authoritative.
	mockAgent.get('https://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, '<html>Orbi login</html>');
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.Model, 'R7800');
	// no SOAP_HTTPs_Port in the body: the port that actually answered seeds the result,
	// instead of falling through to an independent (and unmocked) SOAP port scan
	assert.equal(currentSetting.port, 5555);
	assert.equal(currentSetting.tls, true);
});

test('getCurrentSetting keeps probing past an https port that 404s', async () => {
	mockAgent.get('https://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' }).reply(404, 'nope');
	mockAgent.get('https://192.168.1.1:5043').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.port, 5043); // 5043 is a TLS SOAP port and must be probed too
	assert.equal(currentSetting.tls, true);
});

test('getCurrentSetting picks the earliest-priority https port when several answer', async () => {
	mockAgent.get('https://192.168.1.1').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const currentSetting = await router.getCurrentSetting('192.168.1.1');
	assert.equal(currentSetting.port, 443);
	assert.equal(currentSetting.tls, true);
});

test('_getSoapPort returns undefined when no candidate port responds', async () => {
	// no probe interceptors registered at all -> every candidate is rejected by disableNetConnect
	const router = makeRouter();
	const port = await router._getSoapPort('192.168.1.1');
	assert.equal(port, undefined);
});

test('login adopts the tls discovered by the https fallback, not the constructor default', async () => {
	// end-to-end HTTPS-only case: http:80 refused, currentsetting.htm only on TLS :5555.
	// login() must then send its SOAP call over https:5555 - keeping the port-derived
	// tls default here would aim every authenticated call at a port the router refuses.
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, soapPortOkResponse());

	const router = makeRouter({
		port: undefined, tls: false, loginMethod: undefined, loggedIn: false,
	});
	assert.equal(await router.login(), true);
	assert.equal(router.port, 5555);
	assert.equal(router.tls, true);
});

test('login keeps a tls pinned by a bare router.tls assignment over the discovered one', async () => {
	// as `new NetgearRouter({ password })` builds it: tls at its automatic default of true
	const router = makeRouter({
		port: undefined, tls: true, tlsAuto: true, loginMethod: undefined, loggedIn: false,
	});
	router.tls = false; // a bare assignment pins it just as the constructor option would
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());
	mockAgent.get('http://192.168.1.1:5555').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, soapPortOkResponse());

	assert.equal(await router.login(), true);
	assert.equal(router.port, 5555);
	assert.equal(router.tls, false);
});

test('login({ tls }) pins tls against autodiscovery, the same as the constructor option', async () => {
	// tls passed as a login option is an explicit setting too - discovery must not override it
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());
	mockAgent.get('http://192.168.1.1:5555').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, soapPortOkResponse());

	const router = makeRouter({ port: undefined, loginMethod: undefined, loggedIn: false });
	assert.equal(await router.login({ tls: false }), true);
	assert.equal(router.port, 5555);
	assert.equal(router.tls, false);
});

test('_discoverAllHostsInfo retries the gateway addresses over https when the http:80 scan finds nothing', async (t) => {
	// pretend we are on 192.168.1.50/24, so the scan sweeps 192.168.1.1-254 on :80 (all
	// refused by disableNetConnect) and then retries .1 and .254 with the https fallback
	t.mock.method(os, 'networkInterfaces', () => ({
		eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }],
	}));
	mockAgent.get('https://192.168.1.1:5555').intercept({ path: '/currentsetting.htm', method: 'GET' })
		.reply(200, currentSettingBody());

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	const [info] = await router._discoverAllHostsInfo();
	assert.equal(info.host, '192.168.1.1');
	assert.equal(info.port, 5555);
	assert.equal(info.tls, true);
});

test('_discoverAllHostsInfo still throws when neither the scan nor the gateway retry finds a router', async (t) => {
	t.mock.method(os, 'networkInterfaces', () => ({
		eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }],
	}));

	const router = makeRouter({ host: undefined, port: undefined, tls: undefined });
	await assert.rejects(router._discoverAllHostsInfo(), /No Netgear router could be discovered/);
});
