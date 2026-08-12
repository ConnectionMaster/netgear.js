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
	// ConfigurationStarted/Finished always succeed and aren't the thing under test here
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: soap.action.configurationStarted } })
		.reply(200, soapOk()).persist();
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: soap.action.configurationFinished } })
		.reply(200, soapOk()).persist();
});

afterEach(() => {
	setGlobalDispatcher(originalDispatcher);
});

// registers one single-use interceptor per expected "real" action, in the exact order
// they must be consumed, and records the order they were actually hit in
const mockActionSequence = (steps) => {
	const attempts = [];
	steps.forEach(({ action, statusCode = 200, body }) => {
		pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: action } })
			.reply(() => {
				attempts.push(action);
				return { statusCode, data: body };
			});
	});
	return attempts;
};

test('setGuestWifi tries method 1 first and records it, without trying method 2, on success', async () => {
	const router = makeRouter();
	const attempts = mockActionSequence([
		{ action: soap.action.setGuestAccessEnabled, body: soapOk() },
	]);

	await router.setGuestWifi(true);
	assert.deepEqual(attempts, [soap.action.setGuestAccessEnabled]);
	assert.equal(router.guestWifiMethod.set24_1, 1);
});

test('setGuestWifi falls back to method 2 when method 1 fails, and records method 2', async () => {
	const router = makeRouter();
	const attempts = mockActionSequence([
		{ action: soap.action.setGuestAccessEnabled, body: soapFail(1) },
		{ action: soap.action.setGuestAccessEnabled2, body: soapOk() },
	]);

	await router.setGuestWifi(true);
	assert.deepEqual(attempts, [soap.action.setGuestAccessEnabled, soap.action.setGuestAccessEnabled2]);
	assert.equal(router.guestWifiMethod.set24_1, 2);
});

test('get5GGuestWifiEnabled tries method 2 (R8000) first and records it, on success', async () => {
	const router = makeRouter();
	const attempts = mockActionSequence([
		{ action: soap.action.get5G1GuestAccessEnabled2, body: soapOk('<NewGuestAccessEnabled>1</NewGuestAccessEnabled>') },
	]);

	const enabled = await router.get5GGuestWifiEnabled();
	assert.equal(enabled, true);
	assert.deepEqual(attempts, [soap.action.get5G1GuestAccessEnabled2]);
	assert.equal(router.guestWifiMethod.get50_1, 2);
});

test('get5GGuestWifiEnabled falls back to method 1 (R7800) when method 2 fails', async () => {
	const router = makeRouter();
	const attempts = mockActionSequence([
		{ action: soap.action.get5G1GuestAccessEnabled2, body: soapFail(1) },
		{ action: soap.action.get5G1GuestAccessEnabled, body: soapOk('<NewGuestAccessEnabled>0</NewGuestAccessEnabled>') },
	]);

	const enabled = await router.get5GGuestWifiEnabled();
	assert.equal(enabled, false);
	assert.deepEqual(attempts, [soap.action.get5G1GuestAccessEnabled2, soap.action.get5G1GuestAccessEnabled]);
	assert.equal(router.guestWifiMethod.get50_1, 1);
});

test('set5GGuestWifi tries method 2 first, falls back to method 1 on failure', async () => {
	const router = makeRouter();
	const attempts = mockActionSequence([
		{ action: soap.action.set5G1GuestAccessEnabled2, body: soapFail(1) },
		{ action: soap.action.set5G1GuestAccessEnabled, body: soapOk() },
	]);

	await router.set5GGuestWifi(true);
	assert.deepEqual(attempts, [soap.action.set5G1GuestAccessEnabled2, soap.action.set5G1GuestAccessEnabled]);
	assert.equal(router.guestWifiMethod.set50_1, 1);
});

test('get5GGuestWifi2Enabled has no fallback (R8000-only)', async () => {
	const router = makeRouter();
	const attempts = mockActionSequence([
		{ action: soap.action.get5GGuestAccessEnabled2, body: soapOk('<NewGuestAccessEnabled>1</NewGuestAccessEnabled>') },
	]);

	const enabled = await router.get5GGuestWifi2Enabled();
	assert.equal(enabled, true);
	assert.deepEqual(attempts, [soap.action.get5GGuestAccessEnabled2]);
});

test('setGuestWifi rejects when both methods fail', async () => {
	const router = makeRouter();
	mockActionSequence([
		{ action: soap.action.setGuestAccessEnabled, body: soapFail(1) },
		{ action: soap.action.setGuestAccessEnabled2, body: soapFail(1) },
	]);

	await assert.rejects(router.setGuestWifi(true));
});
