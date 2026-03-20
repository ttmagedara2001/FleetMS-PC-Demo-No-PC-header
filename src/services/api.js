/**
 * @module api
 * @description Frontend-independent API service layer.
 *
 * This module acts as the single integration point for all data access.
 * In DEMO / standalone mode every function delegates to mockDataService,
 * which generates realistic data entirely in the browser — no backend
 * server, no network calls, zero external dependencies.
 *
 * To connect a real backend in the future, replace the implementations
 * below with actual HTTP / WebSocket calls while keeping the same
 * function signatures so the rest of the app requires zero changes.
 */

import {
  mockGetDeviceStreamData,
  mockGetTopicStreamData,
  mockGetStateDetails,
  mockGetTopicStateDetails,
  mockUpdateStateDetails,
} from "./mockDataService";

// ─────────────────────────────────────────────────────────────────────────────
// TIME RANGE HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a human-readable time range string into ISO-8601 start / end times.
 *
 * @param {string} range - e.g. '1h', '6h', '12h', '24h', '7d', '30d'
 * @returns {{ startTime: string, endTime: string }}
 */
export function getTimeRange(range = "6h") {
  const now = new Date();
  const end = now.toISOString();

  const unitMap = {
    m: 60 * 1000,
    h: 3600 * 1000,
    d: 24 * 3600 * 1000,
    w: 7 * 24 * 3600 * 1000,
  };

  const match = String(range).match(/^(\d+(?:\.\d+)?)\s*([mhdw])$/i);
  let msBack = 6 * 3600 * 1000; // default 6 hours

  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    msBack = value * (unitMap[unit] || 3600 * 1000);
  }

  const start = new Date(now.getTime() - msBack).toISOString();
  return { startTime: start, endTime: end };
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAM DATA (historical telemetry)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch historical stream data for an entire device (all topics).
 *
 * @param {string} deviceId
 * @param {string} startTime - ISO-8601 timestamp
 * @param {string} endTime   - ISO-8601 timestamp
 * @param {string} [pagination='0']
 * @param {string} [pageSize='100']
 * @param {object} [_opts={}]  - Reserved for future options (e.g. { silent: true })
 * @returns {Promise<{ status: string, data: any[], pagination: object }>}
 */
export function getDeviceStreamData(
  deviceId,
  startTime,
  endTime,
  pagination = "0",
  pageSize = "100",
  _opts = {},
) {
  return mockGetDeviceStreamData(deviceId, startTime, endTime, pagination, pageSize);
}

/**
 * Fetch historical stream data for a specific MQTT topic.
 *
 * @param {string} deviceId
 * @param {string} topic
 * @param {string} startTime - ISO-8601 timestamp
 * @param {string} endTime   - ISO-8601 timestamp
 * @param {string} [pagination='0']
 * @param {string} [pageSize='100']
 * @param {object} [_opts={}]
 * @returns {Promise<{ status: string, data: any[], pagination: object }>}
 */
export function getTopicStreamData(
  deviceId,
  topic,
  startTime,
  endTime,
  pagination = "0",
  pageSize = "100",
  _opts = {},
) {
  return mockGetTopicStreamData(deviceId, topic, startTime, endTime, pagination, pageSize);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE (latest persisted values)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the latest state / configuration details for a device.
 * Alias: `getStateDetails` (used in DeviceContext) and
 *        `getDeviceStateDetails` (used in Analysis).
 *
 * @param {string} deviceId
 * @returns {Promise<{ status: string, data: object }>}
 */
export function getStateDetails(deviceId) {
  return mockGetStateDetails(deviceId);
}

/** Alias kept for backwards compatibility with Analysis.jsx import. */
export const getDeviceStateDetails = getStateDetails;

/**
 * Fetch latest state for a specific topic under a device.
 *
 * @param {string} deviceId
 * @param {string} topic
 * @returns {Promise<{ status: string, data: any }>}
 */
export function getTopicStateDetails(deviceId, topic) {
  return mockGetTopicStateDetails(deviceId, topic);
}

/**
 * Write / update state for a specific topic under a device.
 *
 * @param {string} deviceId
 * @param {string} topic
 * @param {object} payload
 * @returns {Promise<{ status: string, message: string }>}
 */
export function updateStateDetails(deviceId, topic, payload) {
  return mockUpdateStateDetails(deviceId, topic, payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE CONTROLS  (AC / Air-Purifier convenience wrappers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle the AC unit for a device.
 *
 * @param {string} deviceId
 * @param {boolean} on - true = ON, false = OFF
 * @returns {Promise}
 */
export function toggleAC(deviceId, on) {
  return mockUpdateStateDetails(deviceId, "fleetMS/device/ac", {
    status: on ? "ON" : "OFF",
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Set the air purifier state for a device.
 *
 * @param {string} deviceId
 * @param {boolean} active - true = ACTIVE, false = INACTIVE
 * @returns {Promise}
 */
export function setAirPurifier(deviceId, active) {
  return mockUpdateStateDetails(deviceId, "fleetMS/device/airPurifier", {
    status: active ? "ACTIVE" : "INACTIVE",
    updatedAt: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT (convenience object for named imports or destructuring)
// ─────────────────────────────────────────────────────────────────────────────

export default {
  getTimeRange,
  getDeviceStreamData,
  getTopicStreamData,
  getStateDetails,
  getDeviceStateDetails,
  getTopicStateDetails,
  updateStateDetails,
  toggleAC,
  setAirPurifier,
};
