/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../lib/errors');

test('all factories return plain Error instances (no custom classes)', () => {
	const all = [
		errors.httpRequestFailed(500),
		errors.notNetgearRouter(),
		errors.incompleteResponse(),
		errors.noResponseCode(),
		errors.incompleteSoapEnvelope(),
		errors.soapResponseCode(1),
	];
	all.forEach((error) => {
		assert.ok(error instanceof Error);
		assert.equal(Object.getPrototypeOf(error), Error.prototype);
	});
});

test('soapResponseCode(404) preserves the exact literal message test/_test.js string-matches on', () => {
	const error = errors.soapResponseCode(404);
	assert.equal(error.message, '404 Not Found. The requested function/page is not available');
	assert.equal(error.code, 404);
});

test('soapResponseCode(401) message', () => {
	const error = errors.soapResponseCode(401);
	assert.equal(error.message, '401 Unauthorized. Incorrect password?');
	assert.equal(error.code, 401);
});

test('soapResponseCode(1) message', () => {
	const error = errors.soapResponseCode(1);
	assert.equal(error.message, '1 Unknown. The requested function is not available');
	assert.equal(error.code, 1);
});

test('soapResponseCode falls back to a generic message for unrecognized codes', () => {
	const error = errors.soapResponseCode(999);
	assert.equal(error.message, 'Invalid response code from router: 999');
	assert.equal(error.code, 999);
});

test('httpRequestFailed includes the status code in both message and .code', () => {
	const error = errors.httpRequestFailed(503);
	assert.match(error.message, /503/);
	assert.equal(error.code, 503);
});
