/**
 * MockDataService — Centralized Demo Data Engine
 *
 * Replaces all HTTP/WebSocket/STOMP calls with locally generated mock data.
 * Provides realistic sensor readings, historical trends, robot telemetry,
 * and simulated real-time updates for a zero-backend demo.
 *
 * @module MockDataService
 */

import { ROOMS, ROOM_CENTERS, percentToGps, resolveRoom, TASK_PHASES } from '../utils/telemetryMath';
import { getRobotsForDevice } from '../config/robotRegistry';
import { DEFAULT_THRESHOLDS } from '../utils/thresholds';

// ════════════════════════════════════════════════════════════════════════════
// ACTIVE TASK REGISTRY — DeviceContext registers tasks here so the mock
// tick function knows WHERE to move robots (instead of random drift).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Map: deviceId → { robotId → { phase, source: {lat,lng}, destination: {lat,lng} } }
 * Populated by DeviceContext when tasks are assigned / updated.
 */
const _activeTasks = {};

/**
 * Register an active task so tickRobots can steer the robot toward it.
 * @param {string} deviceId
 * @param {string} robotId
 * @param {{ phase: string, source_lat?: number, source_lng?: number, destination_lat?: number, destination_lng?: number, 'initiate location'?: string, destination?: string }} taskInfo
 */
export function registerActiveTask(deviceId, robotId, taskInfo) {
  if (!_activeTasks[deviceId]) _activeTasks[deviceId] = {};

  // Resolve source/destination GPS from room names if explicit lat/lng not given
  let srcLat = taskInfo.source_lat ?? taskInfo.src_lat;
  let srcLng = taskInfo.source_lng ?? taskInfo.src_lng;
  if (srcLat == null || srcLng == null) {
    const srcRoom = taskInfo['initiate location'] || taskInfo.source_name || taskInfo.source;
    const resolved = srcRoom ? resolveRoom(srcRoom) : null;
    if (resolved) {
      srcLat = resolved.room.center.lat;
      srcLng = resolved.room.center.lng;
    }
  }

  let dstLat = taskInfo.destination_lat ?? taskInfo.dest_lat;
  let dstLng = taskInfo.destination_lng ?? taskInfo.dest_lng;
  if (dstLat == null || dstLng == null) {
    const dstRoom = taskInfo.destination || taskInfo.destination_name;
    const resolved = dstRoom ? resolveRoom(dstRoom) : null;
    if (resolved) {
      dstLat = resolved.room.center.lat;
      dstLng = resolved.room.center.lng;
    }
  }

  _activeTasks[deviceId][robotId] = {
    phase: taskInfo.phase || TASK_PHASES.ASSIGNED,
    source: { lat: srcLat, lng: srcLng },
    destination: { lat: dstLat, lng: dstLng },
  };
}

/**
 * Clear active task (robot finished or task was cancelled).
 */
export function clearActiveTask(deviceId, robotId) {
  if (_activeTasks[deviceId]) {
    delete _activeTasks[deviceId][robotId];
  }
}

/**
 * Update only the phase of an already registered task (avoids re-resolving coords).
 */
export function updateActiveTaskPhase(deviceId, robotId, phase) {
  if (_activeTasks[deviceId]?.[robotId]) {
    _activeTasks[deviceId][robotId].phase = phase;
  }
}

/** Get a registered task (returns null if none). */
export function getActiveTask(deviceId, robotId) {
  return _activeTasks[deviceId]?.[robotId] || null;
}

// ════════════════════════════════════════════════════════════════════════════
// DEMO CREDENTIALS (visible in Settings UI to show where real keys go)
// ════════════════════════════════════════════════════════════════════════════
export const DEMO_CREDENTIALS = {
  email: 'demo@fabrix-fleet.io',
  password: '••••••••••••••••',
  apiKey: 'DEMO-KEY-fabrix-2026-xxxx-yyyy-zzzz',
  apiBaseUrl: 'https://demo.fabrix-fleet.io/api/v1',
  wsUrl: 'wss://demo.fabrix-fleet.io/ws',
  mqttBroker: 'mqtt://demo.fabrix-fleet.io:1883',
  note: 'These are demo placeholders. Replace with real credentials for production.',
};

// ════════════════════════════════════════════════════════════════════════════
// RANDOM UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/** Returns a random float between min and max, rounded to `decimals` places. */
function rand(min, max, decimals = 1) {
  return +(min + Math.random() * (max - min)).toFixed(decimals);
}

/** Drift a value by a small delta, clamped to [min, max]. */
function drift(current, delta, min, max, decimals = 1) {
  const change = (Math.random() - 0.5) * 2 * delta;
  return +Math.max(min, Math.min(max, current + change)).toFixed(decimals);
}

/** Pick a random element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ════════════════════════════════════════════════════════════════════════════
// MOCK DEVICE & ENVIRONMENT DATA
// ════════════════════════════════════════════════════════════════════════════

/** Current mock environment state per device (mutated by tick). */
const _envState = {};

/** Initialize environment state for a device if not already present. */
function ensureEnvState(deviceId) {
  if (!_envState[deviceId]) {
    _envState[deviceId] = {
      ambient_temp: rand(22, 28),
      ambient_hum: rand(40, 55),
      atmospheric_pressure: rand(1005, 1020, 0),
    };
  }
  return _envState[deviceId];
}

/** Tick the environment state — small drift to simulate real sensor readings. */
export function tickEnvironment(deviceId) {
  const s = ensureEnvState(deviceId);
  s.ambient_temp = drift(s.ambient_temp, 0.5, 15, 45);
  s.ambient_hum = drift(s.ambient_hum, 1.0, 15, 90);
  s.atmospheric_pressure = drift(s.atmospheric_pressure, 2, 990, 1035, 0);
  return { ...s };
}

/** Get current snapshot of environment data for a device. */
export function getEnvironmentSnapshot(deviceId) {
  return { ...ensureEnvState(deviceId) };
}

// ════════════════════════════════════════════════════════════════════════════
// MOCK ROBOT DATA
// ════════════════════════════════════════════════════════════════════════════

/** Current mock robot state per device (keyed by robotId). */
const _robotState = {};

const ROOM_NAMES = Object.keys(ROOMS);

/** Initialize robot states for a device. */
function ensureRobotState(deviceId) {
  if (!_robotState[deviceId]) {
    _robotState[deviceId] = {};
    const registryRobots = getRobotsForDevice(deviceId);
    registryRobots.forEach((reg, idx) => {
      // Place each robot in a different room initially
      const roomName = ROOM_NAMES[idx % ROOM_NAMES.length];
      const center = ROOM_CENTERS[roomName];
      _robotState[deviceId][reg.id] = {
        id: reg.id,
        name: reg.name,
        type: reg.type,
        zone: reg.zone,
        location: {
          lat: center ? drift(center.lat, 0.0002, center.lat - 0.0005, center.lat + 0.0005, 6) : rand(37.422, 37.423, 6),
          lng: center ? drift(center.lng, 0.0002, center.lng - 0.0005, center.lng + 0.0005, 6) : rand(-122.085, -122.083, 6),
          z: 0,
        },
        heading: rand(0, 360, 0),
        environment: {
          temp: rand(28, 38),
          humidity: rand(30, 55),
        },
        status: {
          battery: rand(45, 100, 0),
          load: 'None',
          state: 'IDLE', // All robots start idle until tasks are assigned
        },
        'robot-status': 'online',
        robotStatus: 'online',
        task: null,
        taskQueue: [],
        lastUpdate: Date.now(),
      };
    });
  }
  return _robotState[deviceId];
}

/** Tick all robots on a device — drifts location, battery, temp.
 * If a robot has an active task registered, moves it toward the target coordinates. */
export function tickRobots(deviceId) {
  const robotMap = ensureRobotState(deviceId);
  const deviceTasks = _activeTasks[deviceId] || {};
  const results = {};

  Object.entries(robotMap).forEach(([robotId, robot]) => {
    const activeTask = deviceTasks[robotId];

    if (activeTask) {
      // ── TASK-AWARE MOVEMENT: steer robot toward target ──
      const phase = activeTask.phase;
      let targetLat, targetLng;

      if (phase === TASK_PHASES.ASSIGNED || phase === TASK_PHASES.EN_ROUTE_TO_SOURCE || phase === TASK_PHASES.PICKING_UP) {
        // Move toward source
        targetLat = activeTask.source?.lat;
        targetLng = activeTask.source?.lng;
      } else if (phase === TASK_PHASES.EN_ROUTE_TO_DESTINATION || phase === TASK_PHASES.DELIVERING) {
        // Move toward destination
        targetLat = activeTask.destination?.lat;
        targetLng = activeTask.destination?.lng;
      }

      if (targetLat != null && targetLng != null) {
        // Move ~15–25% of remaining distance each tick (converge in ~5–8 ticks)
        const stepFraction = 0.15 + Math.random() * 0.1;
        const dLat = targetLat - robot.location.lat;
        const dLng = targetLng - robot.location.lng;
        robot.location.lat = +(robot.location.lat + dLat * stepFraction).toFixed(6);
        robot.location.lng = +(robot.location.lng + dLng * stepFraction).toFixed(6);

        // Calculate heading toward target
        const headingRad = Math.atan2(dLng, dLat);
        robot.heading = +((headingRad * 180 / Math.PI + 360) % 360).toFixed(0);
        
        // Update robot state to MOVING when navigating
        robot.status.state = 'MOVING';
      } else {
        // No valid target - keep robot stationary (no movement)
        // Robot stays at current position when task phase doesn't require movement
        robot.status.state = 'ACTIVE'; // At pickup/delivery point
      }
    } else {
      // ── NO TASK: Robot remains stationary (IDLE) ──
      // Robots do not move when they don't have tasks assigned
      // Position, heading remain unchanged
      robot.status.state = 'IDLE';
    }

    // Drift battery (slow drain) - always round to whole number
    robot.status.battery = Math.round(Math.max(10, robot.status.battery - rand(0, 0.3, 1)));

    // Drift temp
    robot.environment.temp = drift(robot.environment.temp, 0.3, 22, 42);
    robot.environment.humidity = drift(robot.environment.humidity, 0.5, 20, 65);

    robot.lastUpdate = Date.now();

    results[robotId] = { ...robot, location: { ...robot.location }, status: { ...robot.status }, environment: { ...robot.environment } };
  });

  return results;
}

/** Get current snapshot of all robots for a device. */
export function getRobotsSnapshot(deviceId) {
  const robotMap = ensureRobotState(deviceId);
  const snapshot = {};
  Object.entries(robotMap).forEach(([id, robot]) => {
    snapshot[id] = { ...robot, location: { ...robot.location }, status: { ...robot.status }, environment: { ...robot.environment } };
  });
  return snapshot;
}

// ════════════════════════════════════════════════════════════════════════════
// MOCK DEVICE STATE DETAILS (replaces GET /get-state-details/device)
// ════════════════════════════════════════════════════════════════════════════

const _deviceControlState = {};

function ensureDeviceControlState(deviceId) {
  if (!_deviceControlState[deviceId]) {
    _deviceControlState[deviceId] = {
      ac: { status: 'OFF' },
      airPurifier: { status: 'INACTIVE' },
      status: { status: 'Online', gateway_health: 'Healthy' },
    };
  }
  return _deviceControlState[deviceId];
}

/**
 * Mock: getStateDetails — returns device control state.
 * Mirrors the shape of the real API response.
 */
export function mockGetStateDetails(deviceId) {
  const ctl = ensureDeviceControlState(deviceId);
  return Promise.resolve({
    status: 'Success',
    data: { ...ctl },
  });
}

/**
 * Mock: getTopicStateDetails — returns topic-specific state.
 */
export function mockGetTopicStateDetails(deviceId, topic) {
  // Robot task topics
  const robotTaskMatch = topic.match(/robots\/([^/]+)\/task$/);
  if (robotTaskMatch) {
    const robotId = robotTaskMatch[1];
    const robotMap = ensureRobotState(deviceId);
    const robot = robotMap[robotId];
    if (robot && robot.task) {
      return Promise.resolve({
        status: 'Success',
        data: { ...robot.task },
      });
    }
    return Promise.resolve({ status: 'Success', data: null });
  }

  // AC / Air Purifier / status
  const ctl = ensureDeviceControlState(deviceId);
  if (topic.includes('ac')) {
    return Promise.resolve({ status: 'Success', data: ctl.ac });
  }
  if (topic.includes('airPurifier')) {
    return Promise.resolve({ status: 'Success', data: ctl.airPurifier });
  }
  return Promise.resolve({ status: 'Success', data: ctl.status });
}

/**
 * Mock: updateStateDetails — updates local control state.
 */
export function mockUpdateStateDetails(deviceId, topic, payload) {
  const ctl = ensureDeviceControlState(deviceId);

  if (topic.includes('ac')) {
    ctl.ac = { ...ctl.ac, ...payload };
  } else if (topic.includes('airPurifier')) {
    ctl.airPurifier = { ...ctl.airPurifier, ...payload };
  } else if (topic.includes('collision')) {
    // absorb collision updates silently
  } else if (topic.match(/robots\/([^/]+)\/task$/)) {
    const robotId = topic.match(/robots\/([^/]+)\/task$/)[1];
    const rMap = ensureRobotState(deviceId);
    if (rMap[robotId]) {
      rMap[robotId].task = { ...rMap[robotId].task, ...payload };
    }
  } else if (topic.includes('emergencyStop')) {
    // absorb
  }

  return Promise.resolve({ status: 'Success', message: 'State updated (demo)' });
}

// ════════════════════════════════════════════════════════════════════════════
// HISTORICAL DATA GENERATION (replaces /get-stream-data/*)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate an array of mock historical data points.
 * @param {number} count - Number of data points
 * @param {number} hours - Time span in hours
 * @param {function} generator - (index, timestamp) => payload object
 */
function generateHistorical(count, hours, generator) {
  const now = Date.now();
  const span = hours * 3600 * 1000;
  const step = span / count;
  const data = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date(now - span + i * step);
    data.push({
      timestamp: ts.toISOString(),
      ...generator(i, ts),
    });
  }
  return data;
}

/**
 * Mock: getDeviceStreamData — returns historical env data for all topics.
 */
export function mockGetDeviceStreamData(deviceId, startTime, endTime, pagination = '0', pageSize = '100') {
  const count = Math.min(parseInt(pageSize) || 100, 200);
  // Parse time range
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const hours = (end - start) / (3600 * 1000);

  let temp = rand(22, 26);
  let hum = rand(40, 50);
  let pressure = rand(1010, 1018, 0);

  const data = generateHistorical(count, Math.max(hours, 1), (i) => {
    temp = drift(temp, 0.8, 18, 38);
    hum = drift(hum, 1.5, 20, 70);
    pressure = drift(pressure, 3, 995, 1030, 0);
    return {
      topic: 'fleetMS/environment',
      payload: JSON.stringify({ temperature: temp, humidity: hum, pressure }),
    };
  });

  return Promise.resolve({
    status: 'Success',
    data,
    pagination: { page: parseInt(pagination), pageSize: count, total: count },
  });
}

/**
 * Mock: getTopicStreamData — returns historical data for a specific topic.
 */
export function mockGetTopicStreamData(deviceId, topic, startTime, endTime, pagination = '0', pageSize = '100') {
  const count = Math.min(parseInt(pageSize) || 100, 200);
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const hours = Math.max((end - start) / (3600 * 1000), 1);

  let data;

  if (topic.includes('temperature') || topic.includes('environment') || topic.includes('env')) {
    let temp = rand(22, 26);
    let hum = rand(40, 50);
    let pressure = rand(1010, 1018, 0);
    data = generateHistorical(count, hours, () => {
      temp = drift(temp, 0.6, 18, 38);
      hum = drift(hum, 1.2, 20, 70);
      pressure = drift(pressure, 2, 995, 1030, 0);
      return { topic, payload: JSON.stringify({ temperature: temp, humidity: hum, pressure }) };
    });
  } else if (topic.includes('battery')) {
    let batt = rand(80, 100, 0);
    data = generateHistorical(count, hours, () => {
      batt = Math.max(10, drift(batt, 1, 10, 100, 0));
      return { topic, payload: JSON.stringify({ battery: batt }) };
    });
  } else if (topic.includes('location')) {
    let lat = rand(37.4215, 37.423, 6);
    let lng = rand(-122.085, -122.083, 6);
    data = generateHistorical(count, hours, () => {
      lat = drift(lat, 0.0001, 37.4215, 37.423, 6);
      lng = drift(lng, 0.0001, -122.085, -122.083, 6);
      return { topic, payload: JSON.stringify({ lat, lng, z: 0, heading: rand(0, 360, 0) }) };
    });
  } else if (topic.match(/robots\/[^/]+$/)) {
    // Generic robot stream — mixed metrics
    let temp = rand(28, 35);
    let batt = rand(60, 100, 0);
    data = generateHistorical(count, hours, () => {
      temp = drift(temp, 0.4, 22, 42);
      batt = Math.max(10, drift(batt, 0.5, 10, 100, 0));
      return {
        topic,
        payload: JSON.stringify({
          temperature: temp,
          battery: batt,
          status: pick(['READY', 'ACTIVE', 'READY']),
        }),
      };
    });
  } else {
    // Fallback — generic numeric
    let val = rand(20, 50);
    data = generateHistorical(count, hours, () => {
      val = drift(val, 2, 0, 100);
      return { topic, payload: JSON.stringify({ value: val }) };
    });
  }

  return Promise.resolve({
    status: 'Success',
    data,
    pagination: { page: parseInt(pagination), pageSize: count, total: count },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MOCK AUTHENTICATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mock login — always succeeds after a short simulated delay.
 * Returns a demo JWT flag.
 */
export async function mockLogin() {
  // Simulate network delay (300–600ms)
  await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
  localStorage.setItem('fabrix_jwt_token', '__demo_mode__');
  return true;
}

/** Mock token — always returns the demo flag. */
export function mockGetToken() {
  return '__demo_mode__';
}

/** Mock clear tokens. */
export function mockClearTokens() {
  localStorage.removeItem('fabrix_jwt_token');
}

/** Mock refresh session — always succeeds. */
export async function mockRefreshSession() {
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// MOCK WEBSOCKET  — simulates real-time updates via setInterval
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mock connectWebSocket — does NOT open a real connection.
 * Instead, sets up intervals that fire onStream/onState callbacks
 * with mock data on a regular cadence (every 3–5 seconds).
 *
 * Returns an object with a .deactivate() method to stop the simulation.
 */
export function mockConnectWebSocket(deviceId, onStream, onState, onConnected, onDisconnected) {
  if (!deviceId) {
    console.error('[MockWS] called without deviceId');
    return { deactivate: () => {} };
  }


  // Simulate connection delay
  const connectTimer = setTimeout(() => {
    if (onConnected) onConnected();
  }, 500);

  // ── Environment stream (every 4s) ──
  const envInterval = setInterval(() => {
    const env = tickEnvironment(deviceId);
    if (onStream) {
      onStream({
        topicSuffix: 'fleetMS/environment',
        topic: 'fleetMS/environment',
        payload: {
          temperature: env.ambient_temp,
          humidity: env.ambient_hum,
          pressure: env.atmospheric_pressure,
        },
      });
    }
  }, 4000);

  // ── Robot stream (every 3s) — round-robin one robot per tick ──
  const robots = getRobotsForDevice(deviceId);
  let robotIdx = 0;
  const robotInterval = setInterval(() => {
    const allRobots = tickRobots(deviceId);
    const robotId = robots[robotIdx % robots.length]?.id;
    robotIdx++;
    if (!robotId) return;

    const r = allRobots[robotId];
    if (!r) return;

    // Send location update
    if (onStream) {
      onStream({
        topicSuffix: `fleetMS/robots/${robotId}/location`,
        topic: `fleetMS/robots/${robotId}/location`,
        payload: {
          lat: r.location.lat,
          lng: r.location.lng,
          z: r.location.z,
          heading: r.heading,
        },
      });
    }

    // Send battery update (every other tick)
    if (robotIdx % 2 === 0 && onStream) {
      onStream({
        topicSuffix: `fleetMS/robots/${robotId}/battery`,
        topic: `fleetMS/robots/${robotId}/battery`,
        payload: { battery: r.status.battery },
      });
    }

    // Send temp update (every third tick)
    if (robotIdx % 3 === 0 && onStream) {
      onStream({
        topicSuffix: `fleetMS/robots/${robotId}/temperature`,
        topic: `fleetMS/robots/${robotId}/temperature`,
        payload: { temperature: r.environment.temp, humidity: r.environment.humidity },
      });
    }
  }, 3000);

  // ── State update (every 8s) — AC / AirPurifier / device status ──
  const stateInterval = setInterval(() => {
    const ctl = ensureDeviceControlState(deviceId);
    if (onState) {
      onState({
        ac_power: ctl.ac.status,
        air_purifier: ctl.airPurifier.status,
        status: ctl.status.status,
        gateway_health: ctl.status.gateway_health,
      });
    }
  }, 8000);

  return {
    deactivate: () => {
      clearTimeout(connectTimer);
      clearInterval(envInterval);
      clearInterval(robotInterval);
      clearInterval(stateInterval);
      if (onDisconnected) onDisconnected();
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PRE-BUILT ENVIRONMENT HISTORY FOR ANALYSIS PAGE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate 24 hours of environment history for the Analysis page.
 * Returns an array of { ts, temperature, humidity, pressure }.
 */
export function generateEnvHistory(deviceId, hours = 24, count = 200) {
  const now = Date.now();
  const span = hours * 3600 * 1000;
  const step = span / count;
  const history = [];

  let temp = rand(22, 26);
  let hum = rand(40, 50);
  let pressure = rand(1010, 1018, 0);

  for (let i = 0; i < count; i++) {
    temp = drift(temp, 0.7, 18, 38);
    hum = drift(hum, 1.5, 20, 70);
    pressure = drift(pressure, 2, 995, 1030, 0);
    history.push({
      ts: now - span + i * step,
      temperature: temp,
      humidity: hum,
      pressure,
    });
  }

  return history;
}

/**
 * Generate robot metric history for the Analysis page.
 * Returns { [robotId]: [{ ts, metric, value }, ...] }
 */
export function generateRobotHistory(deviceId, hours = 24, countPerRobot = 100) {
  const robots = getRobotsForDevice(deviceId);
  const now = Date.now();
  const span = hours * 3600 * 1000;
  const step = span / countPerRobot;
  const history = {};

  robots.forEach(reg => {
    const series = [];
    let batt = rand(70, 100, 0);
    let temp = rand(28, 36);

    for (let i = 0; i < countPerRobot; i++) {
      const ts = now - span + i * step;
      batt = Math.max(10, drift(batt, 0.5, 10, 100, 0));
      temp = drift(temp, 0.3, 22, 42);

      series.push({ ts, metric: 'battery', value: batt });
      series.push({ ts: ts + 500, metric: 'temp', value: temp });
      series.push({ ts: ts + 1000, metric: 'location', value: { lat: rand(37.4215, 37.423, 6), lng: rand(-122.085, -122.083, 6) } });
    }

    history[reg.id] = series;
  });

  return history;
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS SUMMARY
// ════════════════════════════════════════════════════════════════════════════

export default {
  // Auth
  mockLogin,
  mockGetToken,
  mockClearTokens,
  mockRefreshSession,

  // Environment
  tickEnvironment,
  getEnvironmentSnapshot,

  // Robots
  tickRobots,
  getRobotsSnapshot,

  // API replacements
  mockGetStateDetails,
  mockGetTopicStateDetails,
  mockUpdateStateDetails,
  mockGetDeviceStreamData,
  mockGetTopicStreamData,

  // WebSocket replacement
  mockConnectWebSocket,

  // History generators
  generateEnvHistory,
  generateRobotHistory,

  // Task registry
  registerActiveTask,
  clearActiveTask,
  updateActiveTaskPhase,
  getActiveTask,

  // Demo credentials
  DEMO_CREDENTIALS,
};
