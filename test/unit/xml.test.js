/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const xml = require('../../lib/xml');

const envelope = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<v:Envelope xmlns:v="http://schemas.xmlsoap.org/soap/envelope/"><v:Body>${body}</v:Body></v:Envelope>`;

test('parseSoapObject extracts a flat response object', () => {
	const body = envelope('<m:GetInfoResponse xmlns:m="urn:NETGEAR-ROUTER:service:DeviceInfo:1">'
		+ '<ModelName>R7800</ModelName><SerialNumber>1LG23B71067B2</SerialNumber></m:GetInfoResponse>');
	assert.deepEqual(xml.parseSoapObject(body, 'GetInfoResponse'), {
		ModelName: 'R7800',
		SerialNumber: '1LG23B71067B2',
	});
});

test('parseSoapObject preserves leading/trailing whitespace in a value, matching the xml-js behavior it replaces', () => {
	const body = envelope('<m:GetInfoResponse><ModelName>  R7800  </ModelName></m:GetInfoResponse>');
	const result = xml.parseSoapObject(body, 'GetInfoResponse');
	assert.equal(result.ModelName, '  R7800  ');
});

test('parseSoapObject maps empty/self-closing tags to undefined, matching the xml-js behavior it replaces', () => {
	const body = envelope('<m:GetInfoResponse><VPNVersion></VPNVersion><OthersoftwareVersion>N/A</OthersoftwareVersion></m:GetInfoResponse>');
	const result = xml.parseSoapObject(body, 'GetInfoResponse');
	assert.equal(result.VPNVersion, undefined);
	assert.equal(result.OthersoftwareVersion, 'N/A');
});

test('parseSoapObject keeps values as strings by default (nativeType off)', () => {
	const body = envelope('<m:GetSystemInfoResponse><NewCPUUtilization>21</NewCPUUtilization></m:GetSystemInfoResponse>');
	const result = xml.parseSoapObject(body, 'GetSystemInfoResponse');
	assert.equal(result.NewCPUUtilization, '21');
	assert.equal(typeof result.NewCPUUtilization, 'string');
});

test('parseSoapObject coerces numeric text to numbers when nativeType is set', () => {
	const body = envelope('<m:GetSystemInfoResponse><NewCPUUtilization>21</NewCPUUtilization></m:GetSystemInfoResponse>');
	const result = xml.parseSoapObject(body, 'GetSystemInfoResponse', { nativeType: true });
	assert.equal(result.NewCPUUtilization, 21);
	assert.equal(typeof result.NewCPUUtilization, 'number');
});

test('parseSoapObject strips a leading New prefix when requested', () => {
	const body = envelope('<m:GetTimeZoneInfoResponse><NewTimeZone>+1</NewTimeZone><NewIndexValue>19</NewIndexValue></m:GetTimeZoneInfoResponse>');
	assert.deepEqual(xml.parseSoapObject(body, 'GetTimeZoneInfoResponse', { stripNewPrefix: true }), {
		TimeZone: '+1',
		IndexValue: '19',
	});
});

test('parseSoapObject follows a path array to descend past the response element (getSupportFeatureListXML shape)', () => {
	const body = envelope('<m:GetSupportFeatureListXMLResponse><newFeatureList><features>'
		+ '<DynamicQoS>1.0</DynamicQoS><SpeedTest>2.0</SpeedTest></features></newFeatureList></m:GetSupportFeatureListXMLResponse>');
	assert.deepEqual(
		xml.parseSoapObject(body, ['GetSupportFeatureListXMLResponse', 'newFeatureList', 'features']),
		{ DynamicQoS: '1.0', SpeedTest: '2.0' },
	);
});

test('parseSoapObject throws a clean, uniform error when the response key is missing', () => {
	const body = envelope('<m:SomeOtherResponse><Foo>bar</Foo></m:SomeOtherResponse>');
	assert.throws(
		() => xml.parseSoapObject(body, 'GetInfoResponse'),
		/Incorrect or incomplete response from router/,
	);
});

test('extractXmlTag pulls a single tag value out, tolerant of surrounding malformed XML', () => {
	// unclosed sibling <Unrelated> tag and a missing </Body> - extractXmlTag only cares
	// about the one tag it's asked for, unlike a full XML parse which would throw on this
	const malformed = '<Envelope><Body><Unrelated><NewTodayUpload>561.29</NewTodayUpload></Body';
	assert.equal(xml.extractXmlTag(malformed, 'NewTodayUpload'), '561.29');
});

test('extractXmlTag supports multiline content', () => {
	const body = '<NewLogDetails>line one\nline two</NewLogDetails>';
	assert.equal(xml.extractXmlTag(body, 'NewLogDetails', { multiline: true }), 'line one\nline two');
});

test('extractXmlTag throws a clean, uniform error when the tag is absent by default', () => {
	assert.throws(
		() => xml.extractXmlTag('<Foo>bar</Foo>', 'Missing'),
		/Incorrect or incomplete response from router/,
	);
});

test('extractXmlTag returns undefined instead of throwing when optional:true', () => {
	assert.equal(xml.extractXmlTag('<Foo>bar</Foo>', 'Missing', { optional: true }), undefined);
});

test('patchBody strips illegal XML 1.0 control characters (regression test for the never-applied original regex)', () => {
	const withIllegalChar = `before${String.fromCharCode(1)}after`;
	assert.equal(xml.patchBody(withIllegalChar), 'beforeafter');
});

test('patchBody preserves valid supplementary-plane characters (e.g. emoji) while stripping illegal ones', () => {
	const withEmoji = `hello ${String.fromCharCode(1)}\u{1F600}world`;
	assert.equal(xml.patchBody(withEmoji), 'hello \u{1F600}world');
});

test('patchBody normalizes soap-env: prefixes to v:', () => {
	const body = '<soap-env:Envelope><soap-env:Body>x</soap-env:Body></soap-env:Envelope>';
	assert.equal(xml.patchBody(body), '<v:Envelope><v:Body>x</v:Body></v:Envelope>');
});

test('unescapeXmlEntities decodes amp/lt/gt', () => {
	assert.equal(xml.unescapeXmlEntities('a &amp; b &lt;c&gt;'), 'a & b <c>');
});

test('parseSoapTree returns the raw namespace-stripped parsed tree for call sites that need to navigate it themselves', () => {
	const body = envelope('<m:GetAttachDevice2Response><NewAttachDevice><Device>'
		+ '<IP>10.0.0.10</IP><MAC>61:56:FA:1B:E1:21</MAC></Device></NewAttachDevice></m:GetAttachDevice2Response>');
	const tree = xml.parseSoapTree(body);
	const device = tree.Envelope.Body.GetAttachDevice2Response.NewAttachDevice.Device;
	assert.deepEqual(device, { IP: '10.0.0.10', MAC: '61:56:FA:1B:E1:21' });
});

test('resolveSoapPath descends a string or array path under Envelope.Body without flattening or throwing', () => {
	const body = envelope('<m:GetSupportFeatureListXMLResponse><newFeatureList><features>'
		+ '<DynamicQoS>1.0</DynamicQoS></features></newFeatureList></m:GetSupportFeatureListXMLResponse>');
	const tree = xml.parseSoapTree(body);
	assert.deepEqual(
		xml.resolveSoapPath(tree, ['GetSupportFeatureListXMLResponse', 'newFeatureList', 'features']),
		{ DynamicQoS: '1.0' },
	);
	// single-string path is equivalent to a one-element array
	assert.deepEqual(
		xml.resolveSoapPath(tree, 'GetSupportFeatureListXMLResponse'),
		{ newFeatureList: { features: { DynamicQoS: '1.0' } } },
	);
});

test('resolveSoapPath returns undefined (not a throw) when any path segment is missing', () => {
	const body = envelope('<m:GetInfoResponse><Foo>bar</Foo></m:GetInfoResponse>');
	const tree = xml.parseSoapTree(body);
	assert.equal(xml.resolveSoapPath(tree, 'NoSuchResponse'), undefined);
	assert.equal(xml.resolveSoapPath(tree, ['GetInfoResponse', 'NoSuchChild', 'deeper']), undefined);
});

test('flattenEntries maps empty strings to undefined and can strip New prefixes, same as parseSoapObject', () => {
	assert.deepEqual(
		xml.flattenEntries({ NewFoo: 'bar', NewEmpty: '' }, true),
		{ Foo: 'bar', Empty: undefined },
	);
	assert.deepEqual(
		xml.flattenEntries({ Foo: 'bar' }),
		{ Foo: 'bar' },
	);
});
