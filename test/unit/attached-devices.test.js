/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');
const soap = require('../../lib/soapcalls');
const { soapEnvelope, makeRouter } = require('./helpers');

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

const replyFor = (action, body) => {
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: action } }).reply(200, body);
};

// v1 (pipe/semicolon-delimited) fixture: a leading count entry, then one field-set per device
const v1Body = (count, entries) => soapEnvelope(`<ResponseCode>0</ResponseCode><NewAttachDevice>${
	[String(count), ...entries].join('@')
}</NewAttachDevice>`);

const oneDeviceV1Entry = '0;10.0.0.10;MyIPHONE;E1:4F:25:68:34:BA;2.4GHz;70;64;Allow';

// v2 (full XML) fixture
const v2Body = (deviceXmlList) => soapEnvelope('<ResponseCode>0</ResponseCode>'
	+ '<m:GetAttachDevice2Response xmlns:m="urn:NETGEAR-ROUTER:service:DeviceInfo:1">'
	+ `<NewAttachDevice>${deviceXmlList.join('')}</NewAttachDevice>`
	+ '</m:GetAttachDevice2Response>');

const deviceXml = ({
	IP, Name, MAC, ConnectionType,
}) => `<Device><IP>${IP}</IP><Name>${Name}</Name><MAC>${MAC}</MAC><ConnectionType>${ConnectionType}</ConnectionType></Device>`;

test('getAttachedDevices(1) parses the v1 pipe-delimited format', async () => {
	const router = makeRouter();
	replyFor(soap.action.getAttachedDevices, v1Body(1, [oneDeviceV1Entry]));

	const devices = await router.getAttachedDevices(1);
	assert.equal(router.getAttachedDevicesMethod, 1);
	assert.equal(devices.length, 1);
	assert.equal(devices[0].IP, '10.0.0.10');
	assert.equal(devices[0].Name, 'MyIPHONE');
	assert.equal(devices[0].MAC, 'E1:4F:25:68:34:BA');
	assert.equal(devices[0].ConnectionType, '2.4GHz');
	assert.equal(devices[0].Linkspeed, 70);
	assert.equal(devices[0].SignalStrength, 64);
	assert.equal(devices[0].AllowOrBlock, 'Allow');
});

test('getAttachedDevices(1) rejects when the device count marker does not match', async () => {
	const router = makeRouter();
	replyFor(soap.action.getAttachedDevices, v1Body(99, [oneDeviceV1Entry]));

	await assert.rejects(router.getAttachedDevices(1), /number mismatch/);
});

test('getAttachedDevices(2) parses the v2 XML format with multiple devices', async () => {
	const router = makeRouter();
	replyFor(soap.action.getAttachedDevices2, v2Body([
		deviceXml({
			IP: '10.0.0.10', Name: 'MyIPHONE', MAC: 'E1:4F:25:68:34:BA', ConnectionType: '2.4GHz',
		}),
		deviceXml({
			IP: '10.0.0.11', Name: 'MyLaptop', MAC: '61:56:FA:1B:E1:21', ConnectionType: 'wired',
		}),
	]));

	const devices = await router.getAttachedDevices(2);
	assert.equal(router.getAttachedDevicesMethod, 2);
	assert.equal(devices.length, 2);
	assert.equal(devices[0].Name, 'MyIPHONE');
	assert.equal(devices[1].Name, 'MyLaptop');
});

test('getAttachedDevices(2) returns a 1-item array for a single device (v2 collapses a lone sibling to an object)', async () => {
	const router = makeRouter();
	replyFor(soap.action.getAttachedDevices2, v2Body([
		deviceXml({
			IP: '10.0.0.10', Name: 'MyIPHONE', MAC: 'E1:4F:25:68:34:BA', ConnectionType: '2.4GHz',
		}),
	]));

	const devices = await router.getAttachedDevices(2);
	assert.equal(devices.length, 1);
	assert.equal(devices[0].MAC, 'E1:4F:25:68:34:BA');
});

test('getAttachedDevices() auto mode falls back from v1 to v2 when v1 fails to parse', async () => {
	const router = makeRouter();
	// malformed v1 response (mismatched count) causes _getAttachedDevices() to throw
	replyFor(soap.action.getAttachedDevices, v1Body(99, [oneDeviceV1Entry]));
	replyFor(soap.action.getAttachedDevices2, v2Body([
		deviceXml({
			IP: '10.0.0.10', Name: 'MyIPHONE', MAC: 'E1:4F:25:68:34:BA', ConnectionType: '2.4GHz',
		}),
		deviceXml({
			IP: '10.0.0.11', Name: 'MyLaptop', MAC: '61:56:FA:1B:E1:21', ConnectionType: 'wired',
		}),
	]));

	const devices = await router.getAttachedDevices();
	// auto mode always records 0, regardless of which underlying method actually succeeded
	assert.equal(router.getAttachedDevicesMethod, 0);
	assert.equal(devices.length, 2);
});

test('getDeviceListAll parses the semicolon-delimited allowed-device format', async () => {
	const router = makeRouter();
	replyFor(soap.action.getDeviceListAll, soapEnvelope(
		'<ResponseCode>0</ResponseCode><NewAllowDeviceList>1@0;6F:A1:F8:04:9F:E2;OPENELEC;wireless</NewAllowDeviceList>',
	));

	const devices = await router.getDeviceListAll();
	assert.deepEqual(devices, [{ MAC: '6F:A1:F8:04:9F:E2', Name: 'OPENELEC', ConnectionType: 'wireless' }]);
});
