/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');
const soap = require('../../lib/soapcalls');
const { soapOk, soapFail, makeRouter } = require('./helpers');

let mockAgent;
let originalDispatcher;
let pool;

beforeEach(() => {
	originalDispatcher = getGlobalDispatcher();
	mockAgent = new MockAgent();
	mockAgent.disableNetConnect();
	setGlobalDispatcher(mockAgent);
	pool = mockAgent.get('http://192.168.1.1');
});

afterEach(() => {
	setGlobalDispatcher(originalDispatcher);
});

const reply = (action, body, statusCode = 200) => {
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: action } }).reply(statusCode, body);
};

const collectLogs = (router) => {
	const events = [];
	router.on('log', (entry) => events.push(entry));
	return events;
};

test('default logLevel is "warn" - a successful call emits nothing (success is debug-level)', async () => {
	const router = makeRouter();
	const events = collectLogs(router);
	reply(soap.action.getInfo, soapOk('<m:GetInfoResponse><ModelName>R7800</ModelName></m:GetInfoResponse>'));

	await router.getInfo();
	assert.deepEqual(events, []);
});

test('default logLevel "warn" - a single failed SOAP call emits nothing (debug-level, to stay quiet during fallback ladders)', async () => {
	const router = makeRouter();
	const events = collectLogs(router);
	reply(soap.action.getInfo, soapFail(1));

	await assert.rejects(router.getInfo());
	assert.deepEqual(events, []);
});

test('logLevel:"debug" surfaces full SOAP request/response tracing', async () => {
	const router = makeRouter({ logLevel: 'debug' });
	const events = collectLogs(router);
	reply(soap.action.getInfo, soapOk('<m:GetInfoResponse><ModelName>R7800</ModelName></m:GetInfoResponse>'));

	await router.getInfo();
	const messages = events.map((e) => e.message);
	assert.ok(messages.includes('SOAP request'));
	assert.ok(messages.includes('SOAP response'));
	const requestEvent = events.find((e) => e.message === 'SOAP request');
	assert.equal(requestEvent.level, 'debug');
	assert.equal(requestEvent.action, soap.action.getInfo);
	assert.equal(requestEvent.host, '192.168.1.1');
	assert.equal(requestEvent.port, 80);
	assert.ok(requestEvent.timestamp);
	const responseEvent = events.find((e) => e.message === 'SOAP response');
	assert.equal(responseEvent.statusCode, 200);
	assert.equal(typeof responseEvent.durationMs, 'number');
});

test('logLevel:"debug" also surfaces the interpreted failure reason for a failed call', async () => {
	const router = makeRouter({ logLevel: 'debug' });
	const events = collectLogs(router);
	reply(soap.action.getInfo, soapFail(1));

	await assert.rejects(router.getInfo());
	const failureEvent = events.find((e) => e.message === 'SOAP request failed');
	assert.ok(failureEvent, 'expected a "SOAP request failed" debug log');
	assert.equal(failureEvent.level, 'debug');
	assert.equal(failureEvent.action, soap.action.getInfo);
	assert.match(failureEvent.error, /Unknown/);
});

test('login() success emits an info-level summary (visible at logLevel:"info")', async () => {
	const router = makeRouter({ logLevel: 'info', loggedIn: false });
	const events = collectLogs(router);
	reply(soap.action.login, soapOk());

	await router.login({ method: 2 });
	const successEvent = events.find((e) => e.message === 'Login succeeded');
	assert.ok(successEvent);
	assert.equal(successEvent.level, 'info');
	assert.equal(successEvent.host, '192.168.1.1');
});

test('login() success is NOT emitted at the default logLevel:"warn" (info is more verbose than warn)', async () => {
	const router = makeRouter({ loggedIn: false });
	const events = collectLogs(router);
	reply(soap.action.login, soapOk());

	await router.login({ method: 2 });
	assert.deepEqual(events, []);
});

test('login() total failure emits a warn-level summary even at the default logLevel', async () => {
	const router = makeRouter({ loggedIn: false }); // loginMethod:2 from makeRouter - auto mode tries login first, then loginOld
	const events = collectLogs(router);
	reply(soap.action.login, soapFail(401));
	reply(soap.action.loginOld, soapFail(401));

	await assert.rejects(router.login());
	const failureEvent = events.find((e) => e.message === 'Login failed');
	assert.ok(failureEvent);
	assert.equal(failureEvent.level, 'warn');
});

test('the login password is never present in an emitted log payload, even at logLevel:"debug"', async () => {
	const router = makeRouter({ logLevel: 'debug', loggedIn: false, password: 'super-secret-password' });
	const events = collectLogs(router);
	reply(soap.action.login, soapOk());

	await router.login({ method: 2 });
	const serialized = JSON.stringify(events);
	assert.doesNotMatch(serialized, /super-secret-password/);
	assert.match(serialized, /\[redacted]/);
});

test('the login password is never present in an emitted log payload for the legacy loginOld method either (uses a differently-named <NewPassword> tag)', async () => {
	const router = makeRouter({
		logLevel: 'debug', loggedIn: false, loginMethod: 1, password: 'super-secret-password',
	});
	const events = collectLogs(router);
	reply(soap.action.loginOld, soapOk());

	await router.login({ method: 1 });
	const serialized = JSON.stringify(events);
	assert.doesNotMatch(serialized, /super-secret-password/);
	assert.match(serialized, /\[redacted]/);
});

test('a WPA passphrase returned by getWPASecurityKeys is never present in an emitted log payload, even at logLevel:"debug"', async () => {
	const router = makeRouter({ logLevel: 'debug' });
	const events = collectLogs(router);
	reply(soap.action.getWPASecurityKeys, soapOk('<m:GetWPASecurityKeysResponse><NewWPAPassphrase>mySecretWifiPassword</NewWPAPassphrase></m:GetWPASecurityKeysResponse>'));

	await router.getWPASecurityKeys();
	const serialized = JSON.stringify(events);
	assert.doesNotMatch(serialized, /mySecretWifiPassword/);
	assert.match(serialized, /\[redacted]/);
});

test('logLevel is mutable at runtime - bumping it takes effect on the next call', async () => {
	const router = makeRouter();
	const events = collectLogs(router);
	reply(soap.action.getInfo, soapOk('<m:GetInfoResponse><ModelName>R7800</ModelName></m:GetInfoResponse>'));
	reply(soap.action.getInfo, soapOk('<m:GetInfoResponse><ModelName>R7800</ModelName></m:GetInfoResponse>'));

	await router.getInfo(); // still at default 'warn' - nothing emitted
	assert.deepEqual(events, []);

	router.logLevel = 'debug';
	await router.getInfo();
	assert.ok(events.length > 0, 'expected debug events after bumping logLevel at runtime');
});

test('emitting "log" with zero listeners attached does not throw (the event is not named "error")', async () => {
	const router = makeRouter({ logLevel: 'debug' }); // no .on('log', ...) subscriber at all
	reply(soap.action.getInfo, soapOk('<m:GetInfoResponse><ModelName>R7800</ModelName></m:GetInfoResponse>'));

	await assert.doesNotReject(router.getInfo());
});
