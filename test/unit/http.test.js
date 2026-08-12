/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
	MockAgent, setGlobalDispatcher, getGlobalDispatcher, Agent,
} = require('undici');
const http = require('../../lib/http');

let mockAgent;
let originalDispatcher;

beforeEach(() => {
	originalDispatcher = getGlobalDispatcher();
	mockAgent = new MockAgent();
	mockAgent.disableNetConnect();
	setGlobalDispatcher(mockAgent);
});

afterEach(() => {
	setGlobalDispatcher(originalDispatcher);
});

test('request() returns statusCode, headers and body for a 200 response', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(200, '<v:Envelope><v:Body>ok</v:Body></v:Envelope>', { headers: { 'content-type': 'text/xml' } });

	const result = await http.request('http://192.168.1.1/soap/server_sa/', {
		method: 'POST',
		headers: { soapaction: 'urn:test#Action' },
		body: '<hello/>',
	});

	assert.equal(result.statusCode, 200);
	assert.equal(result.body, '<v:Envelope><v:Body>ok</v:Body></v:Envelope>');
	assert.equal(result.headers['content-type'], 'text/xml');
});

test('request() surfaces non-200 status codes without throwing (caller decides what to do)', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/soap/server_sa/', method: 'POST' }).reply(404, 'not found');

	const result = await http.request('http://192.168.1.1/soap/server_sa/', { method: 'POST', body: 'x' });
	assert.equal(result.statusCode, 404);
	assert.equal(result.body, 'not found');
});

test('request() collects multi-value set-cookie headers into an array via getSetCookie()', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/login', method: 'POST' }).reply(200, 'ok', {
		headers: { 'set-cookie': ['A=1; Path=/', 'B=2; Path=/'] },
	});

	const result = await http.request('http://192.168.1.1/login', { method: 'POST', body: 'x' });
	assert.deepEqual(result.headers['set-cookie'], ['A=1; Path=/', 'B=2; Path=/']);
});

test('request() omits set-cookie entirely when the response sets none', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/x', method: 'GET' }).reply(200, 'ok');
	const result = await http.request('http://192.168.1.1/x');
	assert.equal('set-cookie' in result.headers, false);
});

test('request() sends the cookie/content-type/soapaction headers through unmodified', async () => {
	let receivedHeaders;
	mockAgent.get('http://192.168.1.1').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply((req) => {
			receivedHeaders = req.headers;
			return { statusCode: 200, data: 'ok' };
		});

	await http.request('http://192.168.1.1/soap/server_sa/', {
		method: 'POST',
		headers: {
			soapaction: 'urn:test#Action',
			'content-type': 'multipart/form-data',
			cookie: 'SID=abc123',
		},
		body: '<hello/>',
	});

	const headerText = Array.isArray(receivedHeaders) ? receivedHeaders.join(' ') : JSON.stringify(receivedHeaders);
	assert.match(headerText, /SID=abc123/);
	assert.match(headerText, /urn:test#Action/);
});

test('request() applies a timeout via AbortSignal and rejects when it is exceeded', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/slow', method: 'GET' }).reply(200, 'ok').delay(200);

	await assert.rejects(
		http.request('http://192.168.1.1/slow', { timeout: 20 }),
	);
});

test('request() does not time out when the response arrives before the deadline', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/fast', method: 'GET' }).reply(200, 'ok').delay(5);
	const result = await http.request('http://192.168.1.1/fast', { timeout: 2000 });
	assert.equal(result.statusCode, 200);
});

test('insecureAgent is exported as an undici Agent instance for self-signed SOAP endpoints', () => {
	assert.ok(http.insecureAgent instanceof Agent);
});

test('request() works for a plain http: URL even when insecure:true is passed (flag is a no-op outside https:)', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/x', method: 'GET' }).reply(200, 'ok');
	const result = await http.request('http://192.168.1.1/x', { insecure: true });
	assert.equal(result.statusCode, 200);
});

test('request() rejects on a 3xx redirect instead of silently following it', async () => {
	mockAgent.get('http://192.168.1.1').intercept({ path: '/soap/server_sa/', method: 'POST' })
		.reply(302, '', { headers: { location: 'http://evil.example/steal-cookie' } });

	await assert.rejects(
		http.request('http://192.168.1.1/soap/server_sa/', { method: 'POST', body: 'x' }),
	);
});

test('_setInsecureDispatcherForTesting redirects insecure:true https: requests to a given dispatcher (test seam)', async () => {
	// an https: + insecure:true request normally goes through the real insecureAgent, which
	// bypasses setGlobalDispatcher(mockAgent) entirely (it's passed as an explicit per-request
	// dispatcher) - this seam exists so tests can still intercept that path via MockAgent
	mockAgent.get('https://192.168.1.1').intercept({ path: '/secure', method: 'GET' }).reply(200, 'ok');
	http._setInsecureDispatcherForTesting(mockAgent);
	try {
		const result = await http.request('https://192.168.1.1/secure', { insecure: true });
		assert.equal(result.statusCode, 200);
	} finally {
		http._setInsecureDispatcherForTesting(null); // restore the real insecureAgent
	}
});
