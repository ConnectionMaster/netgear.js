/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017, 2018, Robin de Gruijter <gruijter@hotmail.com> */

'use strict';

exports.action = {
	// device config
	loginOld: 'urn:NETGEAR-ROUTER:service:ParentalControl:1#Authenticate',
	login: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#SOAPLogin',
	logout: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#SOAPLogout',
	reboot: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#Reboot',
	checkNewFirmware: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#CheckNewFirmware',
	updateNewFirmware: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#UpdateNewFirmware',
	configurationStarted: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#ConfigurationStarted',
	configurationFinished: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#ConfigurationFinished',

	// device config, block/allow device related
	getBlockDeviceEnableStatus: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#GetBlockDeviceEnableStatus',	// ***NEW***
	setBlockDeviceEnable: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#SetBlockDeviceEnable', // ***NEW***
	enableBlockDeviceForAll: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#EnableBlockDeviceForAll', // ***NEW***	// deprecated?
	setBlockDevice: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#SetBlockDeviceByMAC',

	// device config, traffic meter related
	getTrafficMeterEnabled: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#GetTrafficMeterEnabled', // ***NEW***
	getTrafficMeterOptions: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#GetTrafficMeterOptions', // ***NEW***
	getTrafficMeter: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#GetTrafficMeterStatistics',

	// parental control
	getParentalControlEnableStatus: 'urn:NETGEAR-ROUTER:service:ParentalControl:1#GetEnableStatus', // ***NEW***

	// device info
	getInfo: 'urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetInfo',
	getSupportFeatureListXML: 'urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetSupportFeatureListXML',
	getAttachedDevices: 'urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetAttachDevice',
	getAttachedDevices2: 'urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetAttachDevice2',

	// AdvancedQoS
	speedTestStart: 'urn:NETGEAR-ROUTER:service:AdvancedQoS:1#SetOOKLASpeedTestStart',
	speedTestResult: 'urn:NETGEAR-ROUTER:service:AdvancedQoS:1#GetOOKLASpeedTestResult',

	// WLANConfiguration
	getGuestAccessEnabled: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#GetGuestAccessEnabled',	// 2.4G-1 R7800/R8000
	get5G1GuestAccessEnabled: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#Get5GGuestAccessEnabled',	// 5G-1 R7800
	get5G1GuestAccessEnabled2: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#Get5G1GuestAccessEnabled',	// 5G-1 R8000
	get5GGuestAccessEnabled2: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#Get5GGuestAccessEnabled2',	// 5G-2 R8000
	setGuestAccessEnabled: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#SetGuestAccessEnabled',	// 2.4G-1 R7800
	setGuestAccessEnabled2: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#SetGuestAccessEnabled2',	// 2.4G-1 R8000
	set5G1GuestAccessEnabled: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#Set5GGuestAccessEnabled',	// 5G-1 R7800
	set5G1GuestAccessEnabled2: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#Set5G1GuestAccessEnabled2',	// 5G-1 R8000
	set5GGuestAccessEnabled2: 'urn:NETGEAR-ROUTER:service:WLANConfiguration:1#Set5GGuestAccessEnabled2',	// 5G-2 R8000

	// new stuff yet to implement
	getBandwidthControlOptions: 'urn:NETGEAR-ROUTER:service:AdvancedQoS:1#GetBandwidthControlOptions', // ***NEW***
	getQoSEnableStatus: 'urn:NETGEAR-ROUTER:service:AdvancedQoS:1#GetQoSEnableStatus', // ***NEW***
	setQoSEnableStatus: 'urn:NETGEAR-ROUTER:service:AdvancedQoS:1#SetQoSEnableStatus', // ***NEW***
	setBandwidthControlOptions: 'urn:NETGEAR-ROUTER:service:AdvancedQoS:1#SetBandwidthControlOptions', // ***NEW***
	// setTrafficMeterEnable: 'urn:NETGEAR-ROUTER:service:DeviceConfig:1#SetTrafficMeterEnable', // THIS SHOULD EXIST, BUT IS NOT CAPTURED

};

const soapEnvelope = (sessionId, soapBody) => {
	const soapRequest = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
	<SOAP-ENV:Envelope
	xmlns:SOAPSDK1="http://www.w3.org/2001/XMLSchema"
	xmlns:SOAPSDK2="http://www.w3.org/2001/XMLSchema-instance"
	xmlns:SOAPSDK3="http://schemas.xmlsoap.org/soap/encoding/"
	xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
	<SOAP-ENV:Header>
		<SessionID>${sessionId}</SessionID>
	</SOAP-ENV:Header>
	${soapBody}
	</SOAP-ENV:Envelope>`;
	return soapRequest;
};

exports.loginOld = (sessionId, username, password) => {
	const soapBody = `<SOAP-ENV:Body>
	<Authenticate>
		<NewUsername xsi:type="xsd:string" xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance">${username}</NewUsername>
		<NewPassword xsi:type="xsd:string" xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance">${password}</NewPassword>
	</Authenticate>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.login = (sessionId, username, password) => {
	const soapBody = `<SOAP-ENV:Body>
	<M1:SOAPLogin xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
	  <Username>${username}</Username>
	  <Password>${password}</Password>
	</M1:SOAPLogin>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.logout = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SOAPLogout xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:SOAPLogout>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getInfo = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetInfo xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceInfo:1">
		</M1:GetInfo>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getSupportFeatureListXML = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetSupportFeatureListXML xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceInfo:1">
		</M1:GetSupportFeatureListXML>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getParentalControlEnableStatus = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<GetEnableStatus>
		</GetEnableStatus>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getQoSEnableStatus = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetQoSEnableStatus xmlns:M1="urn:NETGEAR-ROUTER:service:AdvancedQoS:1">
		</M1:GetQoSEnableStatus>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getBlockDeviceEnableStatus = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetBlockDeviceEnableStatus xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:GetBlockDeviceEnableStatus>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getTrafficMeterEnabled = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetTrafficMeterEnabled xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:GetTrafficMeterEnabled>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getTrafficMeterOptions = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetTrafficMeterOptions xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:GetTrafficMeterOptions>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getBandwidthControlOptions = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetBandwidthControlOptions xmlns:M1="urn:NETGEAR-ROUTER:service:AdvancedQoS:1">
		</M1:GetBandwidthControlOptions>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.enableBlockDeviceForAll = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:EnableBlockDeviceForAll xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:EnableBlockDeviceForAll>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.setQoSEnableStatus = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetQoSEnableStatus xmlns:M1="urn:NETGEAR-ROUTER:service:AdvancedQoS:1">
		  <NewQoSEnable>${enabled * 1}</NewQoSEnable>
		</M1:SetQoSEnableStatus>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.setBandwidthControlOptions = (sessionId, enabled, newUplinkBandwidth, newDownlinkBandwidth) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetBandwidthControlOptions xmlns:M1="urn:NETGEAR-ROUTER:service:AdvancedQoS:1">
		  <NewUplinkBandwidth>${newUplinkBandwidth}</NewUplinkBandwidth>
		  <NewDownlinkBandwidth>${newDownlinkBandwidth}</NewDownlinkBandwidth>
		  <NewSettingMethod>${enabled * 1}</NewSettingMethod>
		</M1:SetBandwidthControlOptions>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.setBlockDeviceEnable = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetBlockDeviceEnable xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		  <NewBlockDeviceEnable>${enabled * 1}</NewBlockDeviceEnable>
		</M1:SetBlockDeviceEnable>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.setBlockDevice = (sessionId, mac, AllowOrBlock) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetBlockDeviceByMAC xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
			<NewAllowOrBlock>${AllowOrBlock}</NewAllowOrBlock>
			<NewMACAddress>${mac}</NewMACAddress>
		</M1:SetBlockDeviceByMAC>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.configurationStarted = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:ConfigurationStarted xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
			<NewSessionID>${sessionId}</NewSessionID>
			</M1:ConfigurationStarted>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.configurationFinished = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:ConfigurationFinished xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
			<NewStatus>ChangesApplied</NewStatus>
		</M1:ConfigurationFinished>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.attachedDevices = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetAttachDevice xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceInfo:1">
		</M1:GetAttachDevice>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.attachedDevices2 = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetAttachDevice2 xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceInfo:1">
		</M1:GetAttachDevice2>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.trafficMeter = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetTrafficMeterStatistics xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1"></M1:GetTrafficMeterStatistics>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.getGuestAccessEnabled = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetGuestAccessEnabled xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
		</M1:GetGuestAccessEnabled>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.get5G1GuestAccessEnabled = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:Get5G1GuestAccessEnabled xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
		</M1:Get5G1GuestAccessEnabled>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.get5GGuestAccessEnabled2 = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:Get5GGuestAccessEnabled2 xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
		</M1:Get5GGuestAccessEnabled2>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.setGuestAccessEnabled = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetGuestAccessEnabled xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
			<NewGuestAccessEnabled>${enabled * 1}</NewGuestAccessEnabled>
		</M1:SetGuestAccessEnabled>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.setGuestAccessEnabled2 = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetGuestAccessEnabled2 xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
			<NewGuestAccessEnabled>${enabled * 1}</NewGuestAccessEnabled>
		</M1:SetGuestAccessEnabled2>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.set5G1GuestAccessEnabled = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:Set5G1GuestAccessEnabled xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
			<NewGuestAccessEnabled>${enabled * 1}</NewGuestAccessEnabled>
		</M1:Set5G1GuestAccessEnabled>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.set5G1GuestAccessEnabled2 = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:Set5G1GuestAccessEnabled2 xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
			<NewGuestAccessEnabled>${enabled * 1}</NewGuestAccessEnabled>
		</M1:Set5G1GuestAccessEnabled2>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.set5GGuestAccessEnabled2 = (sessionId, enabled) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:Set5GGuestAccessEnabled2 xmlns:M1="urn:NETGEAR-ROUTER:service:WLANConfiguration:1">
			<NewGuestAccessEnabled>${enabled * 1}</NewGuestAccessEnabled>
		</M1:Set5GGuestAccessEnabled2>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.reboot = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:Reboot xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:Reboot>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.checkNewFirmware = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:CheckNewFirmware xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		</M1:CheckNewFirmware>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.updateNewFirmware = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:UpdateNewFirmware xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
		  <YesOrNo>1</YesOrNo>
		</M1:UpdateNewFirmware>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.speedTestStart = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:SetOOKLASpeedTestStart xmlns:M1="urn:NETGEAR-ROUTER:service:AdvancedQoS:1">
		</M1:SetOOKLASpeedTestStart>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};

exports.speedTestResult = (sessionId) => {
	const soapBody = `<SOAP-ENV:Body>
		<M1:GetOOKLASpeedTestResult xmlns:M1="urn:NETGEAR-ROUTER:service:AdvancedQoS:1">
		</M1:GetOOKLASpeedTestResult>
	</SOAP-ENV:Body>`;
	return soapEnvelope(sessionId, soapBody);
};
