/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tryInOrder } = require('../../lib/fallback');

test('resolves with the first strategy that succeeds', async () => {
	const result = await tryInOrder([
		{ label: 1, fn: async () => 'from-1' },
		{ label: 2, fn: async () => 'from-2' },
	]);
	assert.equal(result, 'from-1');
});

test('falls back to the next strategy when an earlier one rejects', async () => {
	const result = await tryInOrder([
		{ label: 2, fn: async () => { throw new Error('method 2 failed'); } },
		{ label: 1, fn: async () => 'from-1' },
	]);
	assert.equal(result, 'from-1');
});

test('rejects with the LAST error when every strategy fails (no aggregation)', async () => {
	await assert.rejects(
		tryInOrder([
			{ label: 2, fn: async () => { throw new Error('first failure'); } },
			{ label: 1, fn: async () => { throw new Error('last failure'); } },
		]),
		/last failure/,
	);
});

test('onAttempt fires before each attempt, including ones that subsequently fail', async () => {
	const attempted = [];
	await tryInOrder([
		{ label: 'a', fn: async () => { throw new Error('nope'); } },
		{ label: 'b', fn: async () => 'ok' },
	], (label) => attempted.push(label));
	assert.deepEqual(attempted, ['a', 'b']);
});

test('does not call later strategies once an earlier one succeeds', async () => {
	let secondCalled = false;
	await tryInOrder([
		{ label: 1, fn: async () => 'done' },
		{ label: 2, fn: async () => { secondCalled = true; return 'unused'; } },
	]);
	assert.equal(secondCalled, false);
});
