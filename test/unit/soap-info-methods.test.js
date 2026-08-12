/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

// Coverage for the methods migrated from regex (extractXmlTag) to true XML parsing
// (parseSoapObject) - each depends on correctly guessing the SOAP response wrapper
// element name (e.g. 'GetSysUpTimeResponse'), which extractXmlTag never needed to know.
// These fixtures encode that assumption explicitly so a wrong guess fails loudly here
// rather than silently in the field.

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
	// auto-succeed config-session bracketing for the two wrapped methods under test here
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: soap.action.configurationStarted } })
		.reply(200, soapEnvelope('<ResponseCode>0</ResponseCode>')).persist();
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: soap.action.configurationFinished } })
		.reply(200, soapEnvelope('<ResponseCode>0</ResponseCode>')).persist();
});

afterEach(() => {
	setGlobalDispatcher(originalDispatcher);
});

const reply = (action, innerXml) => {
	pool.intercept({ path: '/soap/server_sa/', method: 'POST', headers: { soapaction: action } })
		.reply(200, soapEnvelope(`<ResponseCode>0</ResponseCode>${innerXml}`));
};

test('getSysUpTime', async () => {
	const router = makeRouter();
	reply(soap.action.getSysUpTime, '<m:GetSysUpTimeResponse><SysUpTime>709:51:51</SysUpTime></m:GetSysUpTimeResponse>');
	assert.equal(await router.getSysUpTime(), '709:51:51');
});

test('getEthernetLinkStatus', async () => {
	const router = makeRouter();
	reply(soap.action.getEthernetLinkStatus, '<m:GetEthernetLinkStatusResponse>'
		+ '<NewEthernetLinkStatus>Up</NewEthernetLinkStatus></m:GetEthernetLinkStatusResponse>');
	assert.equal(await router.getEthernetLinkStatus(), 'Up');
});

test('getTrafficMeter', async () => {
	const router = makeRouter();
	reply(soap.action.getTrafficMeter, '<m:GetTrafficMeterStatisticsResponse>'
		+ '<NewTodayUpload>24.36</NewTodayUpload><NewTodayDownload>285.06</NewTodayDownload>'
		+ '<NewMonthUpload>5,632/100000</NewMonthUpload><NewMonthDownload>85,111/100000</NewMonthDownload>'
		+ '</m:GetTrafficMeterStatisticsResponse>');
	assert.deepEqual(await router.getTrafficMeter(), {
		newTodayUpload: 24.36, newTodayDownload: 285.06, newMonthUpload: 5632, newMonthDownload: 85111,
	});
});

test('getParentalControlEnableStatus', async () => {
	const router = makeRouter();
	reply(soap.action.getParentalControlEnableStatus, '<GetEnableStatusResponse><ParentalControl>1</ParentalControl></GetEnableStatusResponse>');
	assert.equal(await router.getParentalControlEnableStatus(), true);
});

test('getQoSEnableStatus', async () => {
	const router = makeRouter();
	reply(soap.action.getQoSEnableStatus, '<m:GetQoSEnableStatusResponse><NewQoSEnableStatus>1</NewQoSEnableStatus></m:GetQoSEnableStatusResponse>');
	assert.equal(await router.getQoSEnableStatus(), true);
});

test('getCurrentDeviceBandwidth', async () => {
	const router = makeRouter();
	reply(soap.action.getCurrentDeviceBandwidth, '<m:GetCurrentDeviceBandwidthResponse>'
		+ '<NewCurrentDeviceBandwidth>0</NewCurrentDeviceBandwidth></m:GetCurrentDeviceBandwidthResponse>');
	assert.equal(await router.getCurrentDeviceBandwidth(), '0');
});

test('getCurrentBandwidthByMAC', async () => {
	const router = makeRouter();
	reply(soap.action.getCurrentBandwidthByMAC, '<m:GetCurrentBandwidthByMACResponse>'
		+ '<NewCurrentDeviceUpBandwidth>12</NewCurrentDeviceUpBandwidth><NewCurrentDeviceDownBandwidth>34</NewCurrentDeviceDownBandwidth>'
		+ '</m:GetCurrentBandwidthByMACResponse>');
	assert.deepEqual(await router.getCurrentBandwidthByMAC('AA:BB:CC:DD:EE:FF'), {
		currentDeviceUpBandwidth: '12', currentDeviceDownBandwidth: '34',
	});
});

test('getTrafficMeterEnabled', async () => {
	const router = makeRouter();
	reply(soap.action.getTrafficMeterEnabled, '<m:GetTrafficMeterEnabledResponse>'
		+ '<NewTrafficMeterEnable>1</NewTrafficMeterEnable></m:GetTrafficMeterEnabledResponse>');
	assert.equal(await router.getTrafficMeterEnabled(), true);
});

test('getTrafficMeterOptions', async () => {
	const router = makeRouter();
	reply(soap.action.getTrafficMeterOptions, '<m:GetTrafficMeterOptionsResponse>'
		+ '<NewControlOption>No Limit</NewControlOption><NewMonthlyLimit>0</NewMonthlyLimit>'
		+ '<RestartHour>0</RestartHour><RestartMinute>0</RestartMinute><RestartDay>1</RestartDay>'
		+ '</m:GetTrafficMeterOptionsResponse>');
	assert.deepEqual(await router.getTrafficMeterOptions(), {
		newControlOption: 'No Limit', newNewMonthlyLimit: 0, restartHour: 0, restartMinute: 0, restartDay: 1,
	});
});

test('getBandwidthControlOptions', async () => {
	const router = makeRouter();
	reply(soap.action.getBandwidthControlOptions, '<m:GetBandwidthControlOptionsResponse>'
		+ '<NewUplinkBandwidth>60.5</NewUplinkBandwidth><NewDownlinkBandwidth>50.5</NewDownlinkBandwidth><NewSettingMethod>1</NewSettingMethod>'
		+ '</m:GetBandwidthControlOptionsResponse>');
	assert.deepEqual(await router.getBandwidthControlOptions(), {
		newUplinkBandwidth: 60.5, newDownlinkBandwidth: 50.5, enabled: 1,
	});
});

test('getBlockDeviceEnableStatus', async () => {
	const router = makeRouter();
	reply(soap.action.getBlockDeviceEnableStatus, '<m:GetBlockDeviceEnableStatusResponse>'
		+ '<NewBlockDeviceEnable>1</NewBlockDeviceEnable></m:GetBlockDeviceEnableStatusResponse>');
	assert.equal(await router.getBlockDeviceEnableStatus(), true);
});

test('getWifiChannels', async () => {
	const router = makeRouter();
	reply(soap.action.getAvailableChannel, '<n0:GetAvailableChannelResponse>'
		+ '<NewAvailableChannel>Auto,1,2,3</NewAvailableChannel></n0:GetAvailableChannelResponse>');
	assert.deepEqual(await router.getWifiChannels(), ['Auto', '1', '2', '3']);
});

test('getChannelInfo', async () => {
	const router = makeRouter();
	reply(soap.action.getChannelInfo, '<m:GetChannelInfoResponse><NewChannel>6</NewChannel></m:GetChannelInfoResponse>');
	assert.equal(await router.getChannelInfo(), '6');
});

test('get5GChannelInfo', async () => {
	const router = makeRouter();
	reply(soap.action.get5GChannelInfo, '<m:Get5GChannelInfoResponse><New5GChannel>48</New5GChannel></m:Get5GChannelInfoResponse>');
	assert.equal(await router.get5GChannelInfo(), '48');
});

test('get5G1ChannelInfo', async () => {
	const router = makeRouter();
	reply(soap.action.get5G1ChannelInfo, '<m:Get5G1ChannelInfoResponse><New5G1Channel>153</New5G1Channel></m:Get5G1ChannelInfoResponse>');
	assert.equal(await router.get5G1ChannelInfo(), '153');
});

test('getSmartConnectEnabled', async () => {
	const router = makeRouter();
	reply(soap.action.getSmartConnectEnabled, '<n0:IsSmartConnectEnabledResponse>'
		+ '<NewSmartConnectEnable>1</NewSmartConnectEnable></n0:IsSmartConnectEnabledResponse>');
	assert.equal(await router.getSmartConnectEnabled(), true);
});

test('speedTest result (_getSpeedTestResult, via internal method)', async () => {
	const router = makeRouter();
	reply(soap.action.speedTestResult, '<m:GetOOKLASpeedTestResultResponse>'
		+ '<NewOOKLAUplinkBandwidth>60</NewOOKLAUplinkBandwidth>'
		+ '<NewOOKLADownlinkBandwidth>500</NewOOKLADownlinkBandwidth><AveragePing>12</AveragePing>'
		+ '</m:GetOOKLASpeedTestResultResponse>');
	assert.deepEqual(await router._getSpeedTestResult(), { uplinkBandwidth: 60, downlinkBandwidth: 500, averagePing: 12 });
});

// Regression coverage: parseSoapObject normalizes an empty/self-closing tag to `undefined`
// (matching xml-js, the library it replaces), but a handful of getters call .replace()/.split()
// directly on a field without guarding against that - which the *original* regex-based
// extraction never needed, since a regex match on an empty tag yields '' rather than undefined.
// These lock in the `|| ''` guards added to fix that TypeError-on-empty-tag crash risk.
test('getTrafficMeter does not throw on empty upload/download tags (falls back to 0, matching original)', async () => {
	const router = makeRouter();
	reply(soap.action.getTrafficMeter, '<m:GetTrafficMeterStatisticsResponse>'
		+ '<NewTodayUpload></NewTodayUpload><NewTodayDownload></NewTodayDownload>'
		+ '<NewMonthUpload></NewMonthUpload><NewMonthDownload></NewMonthDownload>'
		+ '</m:GetTrafficMeterStatisticsResponse>');
	assert.deepEqual(await router.getTrafficMeter(), {
		newTodayUpload: 0, newTodayDownload: 0, newMonthUpload: 0, newMonthDownload: 0,
	});
});

test('getTrafficMeterOptions does not throw on an empty NewMonthlyLimit/RestartX tags', async () => {
	const router = makeRouter();
	reply(soap.action.getTrafficMeterOptions, '<m:GetTrafficMeterOptionsResponse>'
		+ '<NewControlOption>No Limit</NewControlOption><NewMonthlyLimit></NewMonthlyLimit>'
		+ '<RestartHour></RestartHour><RestartMinute></RestartMinute><RestartDay></RestartDay>'
		+ '</m:GetTrafficMeterOptionsResponse>');
	assert.deepEqual(await router.getTrafficMeterOptions(), {
		newControlOption: 'No Limit', newNewMonthlyLimit: 0, restartHour: 0, restartMinute: 0, restartDay: 0,
	});
});

test('getBandwidthControlOptions does not throw on empty bandwidth tags', async () => {
	const router = makeRouter();
	reply(soap.action.getBandwidthControlOptions, '<m:GetBandwidthControlOptionsResponse>'
		+ '<NewUplinkBandwidth></NewUplinkBandwidth><NewDownlinkBandwidth></NewDownlinkBandwidth>'
		+ '<NewSettingMethod></NewSettingMethod>'
		+ '</m:GetBandwidthControlOptionsResponse>');
	assert.deepEqual(await router.getBandwidthControlOptions(), {
		newUplinkBandwidth: 0, newDownlinkBandwidth: 0, enabled: 0,
	});
});

test('getWifiChannels does not throw on an empty NewAvailableChannel tag', async () => {
	const router = makeRouter();
	reply(soap.action.getAvailableChannel, '<n0:GetAvailableChannelResponse>'
		+ '<NewAvailableChannel></NewAvailableChannel></n0:GetAvailableChannelResponse>');
	assert.deepEqual(await router.getWifiChannels(), ['']);
});
