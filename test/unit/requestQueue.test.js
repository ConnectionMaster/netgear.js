/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const RequestQueue = require('../../lib/requestQueue');

test('enqueue resolves/rejects with the task function\'s own outcome', async () => {
	const queue = new RequestQueue({ ratePerSecond: 3 });
	const ok = await queue.enqueue(async () => 'result');
	assert.equal(ok, 'result');
	await assert.rejects(queue.enqueue(async () => { throw new Error('boom'); }), /boom/);
});

test('dispatches up to ratePerSecond tasks immediately, then paces the rest', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const queue = new RequestQueue({ ratePerSecond: 3 });
	const started = [];
	const makeTask = (id) => () => {
		started.push(id);
		return Promise.resolve(id);
	};

	const results = Promise.all([
		queue.enqueue(makeTask(1)),
		queue.enqueue(makeTask(2)),
		queue.enqueue(makeTask(3)),
		queue.enqueue(makeTask(4)),
		queue.enqueue(makeTask(5)),
	]);

	// let the microtask queue settle so the first 3 (within the rate) start synchronously
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1, 2, 3], 'first 3 should start immediately, 4th and 5th should be paced');

	// advance past the 1-second window so the 4th/5th can dispatch
	t.mock.timers.tick(1000);
	await Promise.resolve();
	await Promise.resolve();
	t.mock.timers.tick(1000);
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1, 2, 3, 4, 5]);

	assert.deepEqual(await results, [1, 2, 3, 4, 5]);
});

test('does not block later dispatches on a slow in-flight task (rate-limiting, not concurrency-limiting)', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const queue = new RequestQueue({ ratePerSecond: 3 });
	const started = [];

	// task 1 never resolves within this test - later tasks must still be able to start
	queue.enqueue(() => { started.push('slow'); return new Promise(() => {}); });
	queue.enqueue(() => { started.push('fast'); return Promise.resolve('fast-done'); });

	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, ['slow', 'fast']);
});

test('a burst larger than ratePerSecond waits out the rolling window before continuing', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const queue = new RequestQueue({ ratePerSecond: 2 });
	const started = [];
	for (let i = 1; i <= 4; i += 1) {
		queue.enqueue(() => { started.push(i); return Promise.resolve(i); });
	}

	await Promise.resolve();
	await Promise.resolve();
	// items 1 and 2 start immediately (within the rate); 3 and 4 must wait
	assert.deepEqual(started, [1, 2]);

	// items 1 and 2 started at the identical (frozen) timestamp, so they age out of the
	// rolling 1s window together - both 3 and 4 become dispatchable in the same tick
	t.mock.timers.tick(1000);
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1, 2, 3, 4]);
});

test('spaced-out arrivals only unblock one slot at a time as the window rolls', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const queue = new RequestQueue({ ratePerSecond: 2 });
	const started = [];
	const push = (id) => () => { started.push(id); return Promise.resolve(id); };

	queue.enqueue(push(1));
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1]);

	// item 2 arrives 500ms later, still within the rate (only 1 dispatch so far) - starts immediately
	t.mock.timers.tick(500);
	queue.enqueue(push(2));
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1, 2]);

	// item 3 arrives now (t=500ms): rate is full (1 and 2 both within the last 1s) - must wait
	queue.enqueue(push(3));
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1, 2], '3rd task should not start until item 1 (t=0) ages out at t=1000ms');

	// advance to t=1000ms: item 1 (started at t=0) ages out, freeing a slot for item 3
	t.mock.timers.tick(500);
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(started, [1, 2, 3]);
});
