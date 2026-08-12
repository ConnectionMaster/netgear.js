/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

// Fixtures in this file are transcribed VERBATIM (not hand-guessed) from a real captured
// SOAP request/response log against a physical Netgear Nighthawk X6 R8000
// (firmware v1.0.3.48_1.1.33), published at https://github.com/MatMaul/pynetgear/issues/20
// (attachment netgear-r8000-soap.txt). Every fixture here is cross-checked against that log
// by matching the exact SOAP service+method URN this package sends, not just the method name
// (the log itself warns the same method name can appear under different, unrelated services -
// e.g. 'GetInfo' appears under several). This is a stronger correctness signal than the
// synthetic fixtures elsewhere in this suite: it proves the response *shape this package
// assumes* is the shape a real router actually sends, on at least one real device/firmware.

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

// responseCode is the SOAP-level <ResponseCode> (not the HTTP status, always 200 here) - per
// the log's own notes, '000' is success and e.g. '501' means invalid method name.
const reply = (action, innerXml, responseCode = '000') => {
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: action } })
		.reply(200, soapEnvelope(`<ResponseCode>${responseCode}</ResponseCode>${innerXml}`));
};

test('getWANDNSLookUpStatus: reproduces a real R8000 firmware bug - the router wraps the ' // eslint-disable-line max-len
	+ 'response in <GetConnectionTypeInfoResponse> (borrowed from the unrelated GetConnectionTypeInfo ' // eslint-disable-line max-len
	+ 'method) instead of <GetDNSLookUpStatusResponse>', async () => {
	const router = makeRouter();
	// verbatim from the log's WANIPConnection/GetDNSLookUpStatus capture
	reply(soap.action.getWANDNSLookUpStatus, ''
		+ '<m:GetConnectionTypeInfoResponse xmlns:m="urn:NETGEAR-ROUTER:service:WANIPConnection:1">'
		+ '<NewDNSLookUpStatus>-1</NewDNSLookUpStatus>'
		+ '</m:GetConnectionTypeInfoResponse>');

	const result = await router.getWANDNSLookUpStatus();
	assert.deepEqual(result, { DNSLookUpStatus: '-1' });
});

test('getWANDNSLookUpStatus falls back to the conventionally-correct wrapper for a router/firmware without the R8000 bug', async () => {
	const router = makeRouter();
	reply(soap.action.getWANDNSLookUpStatus, ''
		+ '<m:GetDNSLookUpStatusResponse xmlns:m="urn:NETGEAR-ROUTER:service:WANIPConnection:1">'
		+ '<NewDNSLookUpStatus>0</NewDNSLookUpStatus>'
		+ '</m:GetDNSLookUpStatusResponse>');

	const result = await router.getWANDNSLookUpStatus();
	assert.deepEqual(result, { DNSLookUpStatus: '0' });
});

test('getWPASecurityKeys matches the real GetWPASecurityKeysResponse/NewWPAPassphrase shape', async () => {
	const router = makeRouter();
	reply(soap.action.getWPASecurityKeys, ''
		+ '<m:GetWPASecurityKeysResponse xmlns:m="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">'
		+ '<NewWPAPassphrase>mySecretWifiPassword</NewWPAPassphrase>'
		+ '</m:GetWPASecurityKeysResponse>');

	assert.deepEqual(await router.getWPASecurityKeys(), { WPAPassphrase: 'mySecretWifiPassword' });
});

test('get5GWPASecurityKeys matches the real Get5GWPASecurityKeysResponse shape', async () => {
	const router = makeRouter();
	reply(soap.action.get5GWPASecurityKeys, ''
		+ '<m:Get5GWPASecurityKeysResponse xmlns:m="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">'
		+ '<NewWPAPassphrase>mySecretWifiPassword5G</NewWPAPassphrase>'
		+ '</m:Get5GWPASecurityKeysResponse>');

	assert.deepEqual(await router.get5GWPASecurityKeys(), { WPAPassphrase: 'mySecretWifiPassword5G' });
});

test('get5G1WPASecurityKeys matches the real Get5G1WPASecurityKeysResponse shape (tri-band routers)', async () => {
	const router = makeRouter();
	reply(soap.action.get5G1WPASecurityKeys, ''
		+ '<m:Get5G1WPASecurityKeysResponse xmlns:m="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">'
		+ '<NewWPAPassphrase>mySecretWifiPassword5G1</NewWPAPassphrase>'
		+ '</m:Get5G1WPASecurityKeysResponse>');

	assert.deepEqual(await router.get5G1WPASecurityKeys(), { WPAPassphrase: 'mySecretWifiPassword5G1' });
});

test('getAllMACAddresses matches the real GetAllMACAddressesResponse shape (captured example was an empty list)', async () => {
	const router = makeRouter();
	reply(soap.action.getAllMACAddresses, ''
		+ '<m:GetAllMACAddressesResponse xmlns:m="urn:NETGEAR-ROUTER:service:ParentalControl:1">'
		+ '<AllMACAddresses></AllMACAddresses>'
		+ '</m:GetAllMACAddressesResponse>');

	// empty XML element -> undefined, per parseSoapObject's xml-js-compatible empty-tag handling
	assert.deepEqual(await router.getAllMACAddresses(), { AllMACAddresses: undefined });
});

test('getTrafficMeter parses real router values, including the "count/MB" NewMonth* format', async () => {
	const router = makeRouter();
	// verbatim (trimmed to the fields this package reads) from the log's
	// DeviceConfig/GetTrafficMeterStatistics capture
	reply(soap.action.getTrafficMeter, ''
		+ '<m:GetTrafficMeterStatisticsResponse xmlns:m="urn:NETGEAR-ROUTER:service:DeviceConfig:1">'
		+ '<NewTodayUpload>236.89</NewTodayUpload>'
		+ '<NewTodayDownload>269.98</NewTodayDownload>'
		+ '<NewMonthUpload>2415/80.51</NewMonthUpload>'
		+ '<NewMonthDownload>27777/925.90</NewMonthDownload>'
		+ '</m:GetTrafficMeterStatisticsResponse>');

	assert.deepEqual(await router.getTrafficMeter(), {
		newTodayUpload: 236.89, newTodayDownload: 269.98, newMonthUpload: 2415, newMonthDownload: 27777,
	});
});

test('getTrafficMeterOptions parses real router values, including zero-padded hour/minute and lowercase "No limit"', async () => {
	const router = makeRouter();
	reply(soap.action.getTrafficMeterOptions, ''
		+ '<m:GetTrafficMeterOptionsResponse xmlns:m="urn:NETGEAR-ROUTER:service:DeviceConfig:1">'
		+ '<NewControlOption>No limit</NewControlOption>'
		+ '<NewMonthlyLimit>0</NewMonthlyLimit>'
		+ '<RestartHour>00</RestartHour>'
		+ '<RestartMinute>00</RestartMinute>'
		+ '<RestartDay>13</RestartDay>'
		+ '</m:GetTrafficMeterOptionsResponse>');

	assert.deepEqual(await router.getTrafficMeterOptions(), {
		newControlOption: 'No limit', newNewMonthlyLimit: 0, restartHour: 0, restartMinute: 0, restartDay: 13,
	});
});

test('checkNewFirmware (v1 method, via explicit fallback) parses the real CheckNewFirmwareResponse shape, including empty tags', async () => {
	const router = makeRouter();
	// v2 (checkAppNewFirmware) failing at the SOAP/HTTP level (e.g. non-zero ResponseCode) is
	// what actually triggers the tryInOrder fallback to v1 - simulate that cleanly here.
	reply(soap.action.checkAppNewFirmware, '', 501);
	// verbatim from the log's real CheckNewFirmwareResponse capture
	reply(soap.action.checkNewFirmware, ''
		+ '<m:CheckNewFirmwareResponse xmlns:m="urn:NETGEAR-ROUTER:service:DeviceConfig:1">'
		+ '<CurrentVersion>1.0.3.48</CurrentVersion>'
		+ '<NewVersion></NewVersion>'
		+ '<ReleaseNote></ReleaseNote>'
		+ '</m:CheckNewFirmwareResponse>');

	const result = await router.checkNewFirmware();
	assert.deepEqual(result, { currentVersion: '1.0.3.48', newVersion: '', releaseNote: '' });
	assert.equal(router.checkNewFirmwareMethod, 1);
});

test('checkNewFirmware: v2 "succeeding" with an unrelated body is not treated as a failure worth falling back from', async () => {
	const router = makeRouter();
	// verbatim from the log: on this router, calling CheckAppNewFirmware without its
	// CheckDurationSecond parameter got back ResponseCode 000 (success) but a completely
	// unrelated <GetInfoResponse> body with none of the expected firmware fields. Because that
	// SOAP call itself resolves successfully, tryInOrder has no reason to fall back to v1 - the
	// failure only surfaces afterwards, as extractXmlTag failing to find 'CurrentVersion'
	// anywhere in the (wrong) body. Documented here as a known sharp edge, not treated as a bug
	// to paper over: this package's own checkAppNewFirmware request always includes the
	// CheckDurationSecond parameter the real router seemingly needed, so this exact failure
	// mode may not reproduce in practice - but if a router ever does return success-with-wrong-
	// content, checkNewFirmware() surfaces a parse error rather than silently falling back.
	reply(soap.action.checkAppNewFirmware, ''
		+ '<m:GetInfoResponse xmlns:m="urn:NETGEAR-ROUTER:service:DeviceConfig:1">'
		+ '<BlankState>0</BlankState>'
		+ '</m:GetInfoResponse>');

	await assert.rejects(router.checkNewFirmware(), /Incorrect or incomplete response from router/);
	assert.equal(router.checkNewFirmwareMethod, 2, 'label is recorded even though parsing later fails');
});
