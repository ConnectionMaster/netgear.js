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

// registers one single-use interceptor per expected call, in the exact order they must
// be consumed - MockAgent's `.persist()` + a reply callback caches the FIRST computed
// reply and replays it for every later match, so a fresh `.intercept()` per step is the
// only way to script "different response on the Nth call" with MockAgent.
const mockSoapSequence = (steps) => {
	const attempts = [];
	steps.forEach(({
		action, statusCode = 200, body, headers,
	}) => {
		pool.intercept({ path: '/soap/server_sa/', method: 'POST' }).reply((req) => {
			attempts.push(req.headers.soapaction);
			assert.equal(req.headers.soapaction, action, `expected soapaction ${action}, got ${req.headers.soapaction}`);
			return { statusCode, data: body, responseOptions: { headers } };
		});
	});
	return attempts;
};

test('login({ method: 1 }) only attempts the old login action', async () => {
	const router = makeRouter({ loggedIn: false });
	const attempts = mockSoapSequence([
		{ action: soap.action.loginOld, body: soapOk() },
	]);

	const loggedIn = await router.login({ method: 1 });
	assert.equal(loggedIn, true);
	assert.deepEqual(attempts, [soap.action.loginOld]);
});

test('login({ method: 2 }) only attempts the new login action', async () => {
	const router = makeRouter({ loggedIn: false });
	const attempts = mockSoapSequence([
		{ action: soap.action.login, body: soapOk() },
	]);

	const loggedIn = await router.login({ method: 2 });
	assert.equal(loggedIn, true);
	assert.deepEqual(attempts, [soap.action.login]);
});

test('auto mode with loginMethod >= 2 tries the new method first and stops there on success', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 2 });
	const attempts = mockSoapSequence([
		{ action: soap.action.login, body: soapOk() },
	]);

	const loggedIn = await router.login();
	assert.equal(loggedIn, true);
	assert.deepEqual(attempts, [soap.action.login]);
});

test('auto mode with loginMethod < 2 tries the old method first and stops there on success', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 1 });
	const attempts = mockSoapSequence([
		{ action: soap.action.loginOld, body: soapOk() },
	]);

	const loggedIn = await router.login();
	assert.equal(loggedIn, true);
	assert.deepEqual(attempts, [soap.action.loginOld]);
});

test('auto mode falls back new -> old when the primary (new) method fails', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 2 });
	const attempts = mockSoapSequence([
		{ action: soap.action.login, statusCode: 200, body: soapFail(401) },
		{ action: soap.action.loginOld, body: soapOk() },
	]);

	const loggedIn = await router.login();
	assert.equal(loggedIn, true);
	// new attempted first (fails), then the auto-mode fallback block retries old, which succeeds
	assert.deepEqual(attempts, [soap.action.login, soap.action.loginOld]);
});

test('login() rejects with "Failed to login" when every attempt fails', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 2 });
	const attempts = mockSoapSequence([
		{ action: soap.action.login, body: soapFail(401) }, // block 2: primary (loginMethod >= 2)
		{ action: soap.action.loginOld, body: soapFail(401) }, // block 3: old fallback
		// block 4 (new fallback) is skipped: new was already tried as the primary attempt above,
		// so retrying it again would be pointless - see the "does not redundantly retry" test below
	]);

	await assert.rejects(router.login(), /Failed to login/);
	assert.deepEqual(attempts, [soap.action.login, soap.action.loginOld]);
});

test('auto mode does not redundantly retry the primary method as its own fallback (loginMethod < 2 side)', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 1 });
	// old is tried as primary (loginMethod < 2) and fails; the old-fallback block must be skipped
	// (it would just retry the exact same failed call) and go straight to the new fallback
	const attempts = mockSoapSequence([
		{ action: soap.action.loginOld, body: soapFail(401) },
		{ action: soap.action.login, body: soapOk() },
	]);

	const loggedIn = await router.login();
	assert.equal(loggedIn, true);
	assert.deepEqual(attempts, [soap.action.loginOld, soap.action.login]);
});

test('a failed new-method attempt resets the cookie, and the auto-mode old fallback does not itself set one', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 2, cookie: ['stale=1'] });
	mockSoapSequence([
		{ action: soap.action.login, body: soapFail(401) },
		{ action: soap.action.loginOld, body: soapOk() },
	]);

	await router.login();
	assert.equal(router.cookie, undefined);
});

test('successful login picks up a returned session cookie', async () => {
	const router = makeRouter({ loggedIn: false, loginMethod: 2 });
	mockSoapSequence([
		{ action: soap.action.login, body: soapOk(), headers: { 'set-cookie': ['SID=abc123; Path=/'] } },
	]);

	await router.login();
	assert.deepEqual(router.cookie, ['SID=abc123; Path=/']);
});
