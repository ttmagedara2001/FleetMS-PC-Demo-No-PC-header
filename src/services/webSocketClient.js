/**
 * @module webSocketClient
 * @description Frontend-independent WebSocket / real-time data client.
 *
 * In DEMO mode this module delegates to the mock WebSocket simulator in
 * mockDataService, which produces realistic periodic push events without
 * opening any real network connections.
 *
 * To connect a real STOMP / native WebSocket broker in production, replace
 * the body of `connectWebSocket` below while keeping the same interface.
 *
 * @interface WebSocketHandle
 * @property {function} deactivate - Stop the connection and clean up timers.
 */

import { mockConnectWebSocket } from "./mockDataService";

/**
 * Open (or simulate) a WebSocket connection for a device.
 *
 * @param {string}   deviceId       - The device to subscribe to.
 * @param {function} onStream       - Called with each incoming stream message.
 * @param {function} onState        - Called with each device state update.
 * @param {function} onConnected    - Called once when the connection is ready.
 * @param {function} onDisconnected - Called when the connection closes.
 *
 * @returns {{ deactivate: function }} - Call .deactivate() to stop the client.
 */
export function connectWebSocket(deviceId, onStream, onState, onConnected, onDisconnected) {
  return mockConnectWebSocket(deviceId, onStream, onState, onConnected, onDisconnected);
}

export default { connectWebSocket };
