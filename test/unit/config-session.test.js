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

test('_withConfigSession still calls ConfigurationFinished (and resets configStarted) even when the wrapped call throws', async () => {
	const router = makeRouter();
	let finishedCalled = false;
	reply(soap.action.configurationStarted, soapOk());
	reply(soap.action.setQoSEnableStatus, soapFail(1)); // the actual setter call fails
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: soap.action.configurationFinished } })
		.reply(() => { finishedCalled = true; return { statusCode: 200, data: soapOk() }; });

	await assert.rejects(router.setQoSEnableStatus(true));
	assert.equal(finishedCalled, true, 'ConfigurationFinished must still be sent after a failed setter call');
	assert.equal(router.configStarted, false, 'configStarted must not be left stuck true');
});

test('_withConfigSession: a failed ConfigurationFinished is recorded on lastResponse, not silently swallowed', async () => {
	const router = makeRouter();
	reply(soap.action.configurationStarted, soapOk());
	reply(soap.action.setQoSEnableStatus, soapOk());
	reply(soap.action.configurationFinished, soapFail(1)); // the finish call itself fails

	const result = await router.setQoSEnableStatus(true);
	assert.equal(result, true, 'the setter itself still succeeds - a failed close is not fatal to the caller');
	assert.ok(router.lastResponse instanceof Error, 'the swallowed finish failure is recorded on lastResponse instead of vanishing');
	assert.match(router.lastResponse.message, /Config finished error/);
	assert.equal(router.configStarted, true, '_configurationFinished resets configStarted back to true on its own failure');
});

test('reboot(): a ConfigurationStarted failure is wrapped in a reboot-specific error message', async () => {
	const router = makeRouter();
	reply(soap.action.configurationStarted, soapFail(1));

	await assert.rejects(router.reboot(), /Reboot request failed\. \(config started failure: /);
});

test('reboot(): ConfigurationFinished still runs even if the reboot call itself fails (e.g. router reboots without responding)', async () => {
	const router = makeRouter();
	let finishedCalled = false;
	reply(soap.action.configurationStarted, soapOk());
	reply(soap.action.reboot, soapFail(1));
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: soap.action.configurationFinished } })
		.reply(() => { finishedCalled = true; return { statusCode: 200, data: soapOk() }; });

	await assert.rejects(router.reboot());
	assert.equal(finishedCalled, true);
	assert.equal(router.configStarted, false);
});
