/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapWithConcurrency } = require('../../lib/concurrency');

test('mapWithConcurrency returns results in the same order as the input, regardless of completion order', async () => {
	const delays = [30, 10, 20, 5];
	const results = await mapWithConcurrency(delays, 4, (ms, i) => new Promise((resolve) => {
		setTimeout(() => resolve(i), ms);
	}));
	assert.deepEqual(results, [0, 1, 2, 3]);
});

test('mapWithConcurrency never runs more than `limit` calls at once', async () => {
	const items = Array.from({ length: 10 }, (_, i) => i);
	let inFlight = 0;
	let maxInFlight = 0;
	await mapWithConcurrency(items, 3, async () => {
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await new Promise((resolve) => { setTimeout(resolve, 5); });
		inFlight -= 1;
	});
	assert.ok(maxInFlight <= 3, `expected at most 3 concurrent calls, saw ${maxInFlight}`);
	assert.equal(maxInFlight, 3, 'should actually reach the concurrency limit, not just stay under it');
});

test('mapWithConcurrency handles a limit larger than the item count without error', async () => {
	const results = await mapWithConcurrency([1, 2], 10, async (n) => n * 2);
	assert.deepEqual(results, [2, 4]);
});

test('mapWithConcurrency handles an empty input array', async () => {
	const results = await mapWithConcurrency([], 5, async () => { throw new Error('should never be called'); });
	assert.deepEqual(results, []);
});

test('mapWithConcurrency propagates a rejection from fn', async () => {
	await assert.rejects(
		mapWithConcurrency([1, 2, 3], 2, async (n) => {
			if (n === 2) throw new Error('boom');
			return n;
		}),
		/boom/,
	);
});
