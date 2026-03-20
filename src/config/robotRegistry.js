/**
 * Robot Registry Configuration
 *
 * Defines 5 robots per device with their IDs, names, and default properties.
 * This is the single source of truth for robot definitions across the application.
 */

// Robot definitions per device — all robots handle Delivery tasks
export const ROBOT_REGISTRY = {
  // Device: deviceTestUC
  deviceTestUC: [
    { id: "R-001", name: "Alpha", type: "Delivery", zone: "Zone A" },
    { id: "R-002", name: "Beta", type: "Delivery", zone: "Zone B" },
    { id: "R-003", name: "Gamma", type: "Delivery", zone: "Zone C" },
    { id: "R-004", name: "Delta", type: "Delivery", zone: "Zone D" },
    { id: "R-005", name: "Epsilon", type: "Delivery", zone: "Zone E" },
  ],

  // Device: devicetestuc
  devicetestuc: [
    { id: "R-001", name: "Alpha", type: "Delivery", zone: "Zone A" },
    { id: "R-002", name: "Beta", type: "Delivery", zone: "Zone B" },
    { id: "R-003", name: "Gamma", type: "Delivery", zone: "Zone C" },
    { id: "R-004", name: "Delta", type: "Delivery", zone: "Zone D" },
    { id: "R-005", name: "Epsilon", type: "Delivery", zone: "Zone E" },
  ],

  // Device: device0011233
  device0011233: [
    { id: "R-101", name: "Orion", type: "Delivery", zone: "Sector 1" },
    { id: "R-102", name: "Nova", type: "Delivery", zone: "Sector 2" },
    { id: "R-103", name: "Pulsar", type: "Delivery", zone: "Sector 3" },
    { id: "R-104", name: "Quasar", type: "Delivery", zone: "Sector 4" },
    { id: "R-105", name: "Nebula", type: "Delivery", zone: "Sector 5" },
  ],

  // Device: device9988
  device9988: [
    { id: "R-201", name: "Atlas", type: "Delivery", zone: "Bay 1" },
    { id: "R-202", name: "Titan", type: "Delivery", zone: "Bay 2" },
    { id: "R-203", name: "Helios", type: "Delivery", zone: "Bay 3" },
    { id: "R-204", name: "Apollo", type: "Delivery", zone: "Bay 4" },
    { id: "R-205", name: "Zeus", type: "Delivery", zone: "Bay 5" },
  ],
};

// Default robot template (for devices not in registry)
export const DEFAULT_ROBOTS = [
  { id: "R-X01", name: "Unit-1", type: "Delivery", zone: "Default" },
  { id: "R-X02", name: "Unit-2", type: "Delivery", zone: "Default" },
  { id: "R-X03", name: "Unit-3", type: "Delivery", zone: "Default" },
  { id: "R-X04", name: "Unit-4", type: "Delivery", zone: "Default" },
  { id: "R-X05", name: "Unit-5", type: "Delivery", zone: "Default" },
];

/**
 * Get robots for a specific device
 * @param {string} deviceId - Device ID
 * @returns {Array} - Array of robot objects
 */
export function getRobotsForDevice(deviceId) {
  return ROBOT_REGISTRY[deviceId] || DEFAULT_ROBOTS;
}

/**
 * Get a specific robot by ID within a device
 * @param {string} deviceId - Device ID
 * @param {string} robotId - Robot ID
 * @returns {Object|null} - Robot object or null if not found
 */
export function getRobotById(deviceId, robotId) {
  const robots = getRobotsForDevice(deviceId);
  return robots.find((r) => r.id === robotId) || null;
}

/**
 * Get all robot IDs for a device
 * @param {string} deviceId - Device ID
 * @returns {Array<string>} - Array of robot IDs
 */
export function getRobotIds(deviceId) {
  return getRobotsForDevice(deviceId).map((r) => r.id);
}

/**
 * Generate WebSocket topics for a robot
 */
export function getRobotTopics(deviceId, robotId) {
  const base = `fleetMS/robots/${robotId}`;
  return {
    // Stream topics (real-time sensor data)
    temperature: `${base}/temperature`,
    humidity: `${base}/humidity`,
    battery: `${base}/battery`,
    location: `${base}/location`,
    status: `${base}/status`,

    // State topics (persistent state)
    task: `${base}/task`,
    settings: `${base}/settings`,
  };
}

/**
 * Default sensor data structure for a robot
 */
export const DEFAULT_ROBOT_SENSOR_DATA = {
  temperature: null,
  humidity: null,
  battery: 100,
  location: { lat: null, lng: null, z: 0, zone: "Ready" },
  status: "Idle",
  lastUpdate: null,
};

/**
 * Robot status values
 */
export const ROBOT_STATUS = {
  IDLE: "Idle",
  ACTIVE: "Active",
  CHARGING: "Charging",
  MAINTENANCE: "Maintenance",
  ERROR: "Error",
  OFFLINE: "Offline",
};

/**
 * Task status values
 */
export const TASK_STATUS = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export default {
  ROBOT_REGISTRY,
  DEFAULT_ROBOTS,
  getRobotsForDevice,
  getRobotById,
  getRobotIds,
  getRobotTopics,
  DEFAULT_ROBOT_SENSOR_DATA,
  ROBOT_STATUS,
  TASK_STATUS,
};
