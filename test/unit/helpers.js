/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2026, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

// Shared fixtures/helpers for the integration-level tests that exercise NetgearRouter
// itself (not just the lib/ primitives) against a mocked SOAP endpoint.
// Filename deliberately doesn't match *.test.js so `node --test` doesn't try to run it.

const NetgearRouter = require('../../netgear');
const RequestQueue = require('../../lib/requestQueue');

const soapEnvelope = (bodyXml) => `<v:Envelope xmlns:v="http://schemas.xmlsoap.org/soap/envelope/"><v:Body>${bodyXml}</v:Body></v:Envelope>`;

const soapOk = (extraXml = '') => soapEnvelope(`<ResponseCode>0</ResponseCode>${extraXml}`);

const soapFail = (code) => soapEnvelope(`<ResponseCode>${code}</ResponseCode>`);

// a router pre-configured with host/port/tls/loggedIn so tests can skip discovery
const makeRouter = (overrides = {}) => {
	const router = new NetgearRouter({ password: 'secret' });
	router.host = '192.168.1.1';
	router.port = 80;
	router.tls = false;
	router.tlsAuto = false; // matching tls: a fixture default, not a caller-pinned setting
	router.loggedIn = true;
	router.loginMethod = 2;
	// the request-rate limiter itself is covered separately (with fake timers) in
	// requestQueue.test.js - give these integration tests a fast queue so a handful of
	// mocked calls per test (e.g. a config-session's start/set/finish) doesn't cost real seconds
	router.queue = new RequestQueue({ ratePerSecond: 1000 });
	Object.assign(router, overrides);
	return router;
};

module.exports = {
	soapEnvelope, soapOk, soapFail, makeRouter,
};
