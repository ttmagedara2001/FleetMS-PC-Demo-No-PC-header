// Utility functions for telemetry math: task completion, robot health, and GPS distance

// ============================================================================
// FACILITY GPS REFERENCE  (single source of truth — keep in sync with Dashboard)
// ============================================================================

/**
 * Real-world GPS bounding box of the entire facility map.
 * Dashboard CSS zones are positioned as percentages (5 %–95 %) inside this box.
 *
 * Conversion:
 *   xPercent → lng :  lng = minLng + ((xPct - 5) / 90) * (maxLng - minLng)
 *   yPercent → lat :  lat = maxLat - ((yPct - 5) / 90) * (maxLat - minLat)  (Y inverted)
 */
export const FACILITY_BOUNDS = {
  minLat: 37.4215,
  maxLat: 37.423,
  minLng: -122.085,
  maxLng: -122.083,
};

const LAT_SPAN = FACILITY_BOUNDS.maxLat - FACILITY_BOUNDS.minLat; // 0.0015
const LNG_SPAN = FACILITY_BOUNDS.maxLng - FACILITY_BOUNDS.minLng; // 0.0020

/** Convert Dashboard CSS-percent position to real GPS. */
export function percentToGps(xPct, yPct) {
  return {
    lat: +(FACILITY_BOUNDS.maxLat - ((yPct - 5) / 90) * LAT_SPAN).toFixed(6),
    lng: +(FACILITY_BOUNDS.minLng + ((xPct - 5) / 90) * LNG_SPAN).toFixed(6),
  };
}

/** Convert real GPS to Dashboard CSS-percent position. */
export function gpsToPercent(lat, lng) {
  const xPct = 5 + ((lng - FACILITY_BOUNDS.minLng) / LNG_SPAN) * 90;
  const yPct = 5 + ((FACILITY_BOUNDS.maxLat - lat) / LAT_SPAN) * 90;
  return {
    xPercent: Math.max(0, Math.min(100, xPct)),
    yPercent: Math.max(0, Math.min(100, yPct)),
  };
}

// ============================================================================
// ROOM / ZONE GEOMETRY  (derived from Dashboard CSS zone percentages → GPS)
// ============================================================================

function buildRoom(id, name, leftPct, topPct, widthPct, heightPct) {
  const nw = percentToGps(leftPct, topPct); // north-west corner
  const se = percentToGps(leftPct + widthPct, topPct + heightPct); // south-east corner
  const center = percentToGps(leftPct + widthPct / 2, topPct + heightPct / 2);
  return {
    id,
    name,
    pct: { left: leftPct, top: topPct, width: widthPct, height: heightPct },
    bounds: { minLat: se.lat, maxLat: nw.lat, minLng: nw.lng, maxLng: se.lng },
    center, // { lat, lng } — real GPS mid-point of the room
  };
}

/**
 * Canonical room definitions.
 * Each room's position is the same CSS-percent rectangle as Dashboard's zones[].
 * buildRoom converts them to real GPS bounding boxes automatically.
 */
export const ROOMS = {
  "Cleanroom A": buildRoom("cleanroom-a", "Cleanroom A", 5, 5, 35, 40),
  "Cleanroom B": buildRoom("cleanroom-b", "Cleanroom B", 45, 5, 30, 40),
  "Loading Bay": buildRoom("loading-bay", "Loading Bay", 5, 55, 25, 35),
  Storage: buildRoom("storage", "Storage", 35, 55, 25, 35),
  Maintenance: buildRoom("maintenance", "Maintenance", 65, 55, 25, 25),
};

/** Map from room name → center GPS coordinates (replaces LOCATION_COORDS in Settings). */
export const ROOM_CENTERS = Object.fromEntries(
  Object.entries(ROOMS).map(([name, r]) => [name, r.center]),
);

/**
 * Fuzzy room name lookup — handles minor spelling mismatches.
 * Normalises to lowercase, strips spaces/hyphens, then tries exact match first,
 * then loose includes-based match.
 * @param {string} name
 * @returns {{ name: string, room: object } | null}
 */
export function resolveRoom(name) {
  if (!name) return null;
  // Exact match first
  if (ROOMS[name]) return { name, room: ROOMS[name] };
  // Normalised match
  const norm = name.toLowerCase().replace(/[\s\-_]+/g, "");
  for (const [key, room] of Object.entries(ROOMS)) {
    const keyNorm = key.toLowerCase().replace(/[\s\-_]+/g, "");
    if (keyNorm === norm || keyNorm.includes(norm) || norm.includes(keyNorm)) {
      return { name: key, room };
    }
  }
  return null;
}

/**
 * Check if a GPS point is inside a named room.
 * @param {number} lat  @param {number} lng
 * @param {string} roomName — one of the keys in ROOMS (fuzzy-matched)
 * @returns {boolean}
 */
export function isInsideRoom(lat, lng, roomName) {
  const resolved = resolveRoom(roomName);
  if (!resolved) return false;
  const { minLat, maxLat, minLng, maxLng } = resolved.room.bounds;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

/**
 * Find which room (if any) the given GPS point falls inside.
 * @returns {{ name: string, room: object } | null}
 */
export function findRoomAtPoint(lat, lng) {
  for (const [name, room] of Object.entries(ROOMS)) {
    const { minLat, maxLat, minLng, maxLng } = room.bounds;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return { name, room };
    }
  }
  return null;
}

// ============================================================================
// TASK PHASE CONSTANTS  (Deliver-only model)
// ============================================================================
export const TASK_PHASES = {
  ASSIGNED: "ASSIGNED", // Task just assigned
  EN_ROUTE_TO_SOURCE: "EN_ROUTE_TO_SOURCE", // Robot heading to pickup
  PICKING_UP: "PICKING_UP", // Robot picking up at source
  EN_ROUTE_TO_DESTINATION: "EN_ROUTE_TO_DESTINATION", // Robot heading to drop-off
  DELIVERING: "DELIVERING", // Robot dropping off at destination
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const PHASE_LABELS = {
  [TASK_PHASES.ASSIGNED]: "📋 Assigned",
  [TASK_PHASES.EN_ROUTE_TO_SOURCE]: "🚀 Heading to Pickup",
  [TASK_PHASES.PICKING_UP]: "📦 Picking Up",
  [TASK_PHASES.EN_ROUTE_TO_DESTINATION]: "🚚 Delivering",
  [TASK_PHASES.DELIVERING]: "📬 Dropping Off",
  [TASK_PHASES.COMPLETED]: "✅ Completed",
  [TASK_PHASES.FAILED]: "❌ Failed",
};

export const PHASE_COLORS = {
  [TASK_PHASES.ASSIGNED]: { bg: "#E0E7FF", color: "#4F46E5" },
  [TASK_PHASES.EN_ROUTE_TO_SOURCE]: { bg: "#DBEAFE", color: "#2563EB" },
  [TASK_PHASES.PICKING_UP]: { bg: "#FEF3C7", color: "#92400E" },
  [TASK_PHASES.EN_ROUTE_TO_DESTINATION]: { bg: "#DBEAFE", color: "#1D4ED8" },
  [TASK_PHASES.DELIVERING]: { bg: "#D1FAE5", color: "#047857" },
  [TASK_PHASES.COMPLETED]: { bg: "#D1FAE5", color: "#059669" },
  [TASK_PHASES.FAILED]: { bg: "#FEE2E2", color: "#DC2626" },
};

// ============================================================================
// GPS / HAVERSINE MATH
// ============================================================================

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000; // metres

/**
 * Haversine distance between two GPS points in metres.
 * @param {number} lat1 @param {number} lng1
 * @param {number} lat2 @param {number} lng2
 * @returns {number} distance in metres
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Arrival threshold in metres — robot is "at location" if within this radius.
 */
export const ARRIVAL_THRESHOLD_M = 15; // 15 metres

/**
 * Collision threshold in metres — two robots are considered colliding if within this distance.
 */
export const COLLISION_THRESHOLD_M = 3; // 3 metres

/**
 * Auto-advance from PICKING_UP / DELIVERING after this delay (ms).
 * Simulates pickup/delivery confirmation when no firmware ACK available.
 */
export const AUTO_ADVANCE_DELAY_MS = 10_000; // 10 seconds

// ============================================================================
// TASK ID GENERATOR
// ============================================================================

let _taskCounter = 0;

/**
 * Generate a unique task ID for Deliver tasks.
 * Format: DEL-<timestamp36>-<counter>
 */
export function generateTaskId() {
  _taskCounter += 1;
  return `DEL-${Date.now().toString(36)}-${_taskCounter}`;
}

/**
 * Calculate delivery progress (0–100) based on current phase and GPS position.
 *
 *  ASSIGNED                       →  0%
 *  EN_ROUTE_TO_SOURCE             →  0–45%  (GPS interpolation toward source)
 *  PICKING_UP                     →  45–50%
 *  EN_ROUTE_TO_DESTINATION        →  50–90%  (GPS interpolation toward destination)
 *  DELIVERING                     →  90–100%
 *  COMPLETED                      →  100%
 */
export function computePhaseProgress(task, currentLat, currentLng) {
  if (!task) return 0;
  const phase = task.phase || TASK_PHASES.ASSIGNED;

  if (phase === TASK_PHASES.COMPLETED) return 100;
  if (phase === TASK_PHASES.FAILED) return task.progress ?? 0;

  // Room names for geofence-based progress snapping
  const srcRoom = task["initiate location"] || task.source_name || null;
  const dstRoom = task.destination || task.destination_name || null;

  // Resolve GPS coordinates — fall back to room center if explicit lat/lng are missing
  const srcResolved = resolveRoom(srcRoom);
  const dstResolved = resolveRoom(dstRoom);
  const srcCenter = srcResolved?.room.center ?? null;
  const dstCenter = dstResolved?.room.center ?? null;
  const srcRoomKey = srcResolved?.name ?? null;
  const dstRoomKey = dstResolved?.name ?? null;

  const srcLat = task.source_lat ?? task.src_lat ?? srcCenter?.lat ?? null;
  const srcLng = task.source_lng ?? task.src_lng ?? srcCenter?.lng ?? null;
  const dstLat =
    task.destination_lat ?? task.dest_lat ?? dstCenter?.lat ?? null;
  const dstLng =
    task.destination_lng ?? task.dest_lng ?? dstCenter?.lng ?? null;

  if (phase === TASK_PHASES.ASSIGNED) return 0;

  // ---- EN_ROUTE_TO_SOURCE: 0–45% ----
  if (phase === TASK_PHASES.EN_ROUTE_TO_SOURCE) {
    if (currentLat == null || currentLng == null) return 5;
    if (srcRoomKey && isInsideRoom(currentLat, currentLng, srcRoomKey))
      return 44;
    if (srcLat == null || srcLng == null) return 5;
    const remaining = haversineDistance(currentLat, currentLng, srcLat, srcLng);
    if (remaining < 1) return 44;
    // Use start position if valid
    const startLat = task.assignedAtLat;
    const startLng = task.assignedAtLng;
    const startIsValid =
      startLat != null &&
      startLng != null &&
      (Math.abs(startLat) > 1 || Math.abs(startLng) > 1) &&
      haversineDistance(startLat, startLng, srcLat, srcLng) < 2000;
    if (startIsValid) {
      const totalLeg = haversineDistance(startLat, startLng, srcLat, srcLng);
      if (totalLeg > 1) {
        const frac = Math.max(0, Math.min(1, 1 - remaining / totalLeg));
        return Math.round(frac * 45);
      }
    }
    const MAX_FACILITY_M = 300;
    const frac = Math.max(0, Math.min(1, 1 - remaining / MAX_FACILITY_M));
    return Math.max(2, Math.round(frac * 45));
  }

  // ---- PICKING_UP: 45–50% ----
  if (phase === TASK_PHASES.PICKING_UP) return 47;

  // ---- EN_ROUTE_TO_DESTINATION: 50–90% ----
  if (phase === TASK_PHASES.EN_ROUTE_TO_DESTINATION) {
    if (currentLat == null || currentLng == null) return 55;
    if (dstRoomKey && isInsideRoom(currentLat, currentLng, dstRoomKey))
      return 88;
    if (dstLat == null || dstLng == null) return 55;
    const remaining = haversineDistance(currentLat, currentLng, dstLat, dstLng);
    if (remaining < 1) return 88;
    let totalLeg = 0;
    if (srcLat != null && srcLng != null) {
      totalLeg = haversineDistance(srcLat, srcLng, dstLat, dstLng);
    }
    if (totalLeg < 5) totalLeg = 300;
    const frac = Math.max(0, Math.min(1, 1 - remaining / totalLeg));
    return Math.round(50 + frac * 40);
  }

  // ---- DELIVERING: 90–100% ----
  if (phase === TASK_PHASES.DELIVERING) return 95;

  return task.progress ?? 0;
}

// ============================================================================
// ORIGINAL HELPERS (kept for backward compat)
// ============================================================================

export function computeRobotHealth(batteryPct) {
  // batteryPct: 0-100
  const pct = Math.round(Math.max(0, Math.min(100, Number(batteryPct) || 0)));
  const score = +(pct / 100).toFixed(3); // 0.0 - 1.0

  let label = "Unknown";
  if (pct >= 70) label = "Good";
  else if (pct >= 40) label = "Fair";
  else if (pct >= 15) label = "Low";
  else label = "Critical";

  return { score, label, pct };
}

export function computeTaskCompletion(task = {}) {
  // Accepts multiple possible inputs. Priority order:
  // 1) explicit task.progress (0-100)
  // 2) distances: initialDistance and remainingDistance
  // 3) steps: stepsCompleted / totalSteps

  if (!task) return 0;

  const progressProvided =
    typeof task.progress === "number" && isFinite(task.progress);
  if (progressProvided) return Math.max(0, Math.min(100, task.progress));

  // Distance-based completion
  const initialDistance = Number(
    task.initialDistance || task.totalDistance || 0,
  );
  const remainingDistance = Number(task.remainingDistance || 0);

  let distanceScore = null;
  if (initialDistance > 0) {
    distanceScore =
      1 -
      Math.max(0, Math.min(initialDistance, remainingDistance)) /
        initialDistance;
  }

  // Steps-based completion
  const stepsCompleted = Number(task.stepsCompleted || 0);
  const totalSteps = Number(task.totalSteps || 0);
  let stepsScore = null;
  if (totalSteps > 0) {
    stepsScore = Math.max(0, Math.min(1, stepsCompleted / totalSteps));
  }

  // Combine available scores. Prefer distance if available, else steps.
  let combined = 0;
  if (distanceScore !== null && stepsScore !== null) {
    // Weighted combine: 70% distance, 30% steps
    combined = 0.7 * distanceScore + 0.3 * stepsScore;
  } else if (distanceScore !== null) combined = distanceScore;
  else if (stepsScore !== null) combined = stepsScore;

  return Math.round(Math.max(0, Math.min(1, combined)) * 100);
}

// Expose formulas for documentation (helpers)
export const formulas = {
  robotHealth: "$health = \\frac{battery_{pct}}{100}$",
  taskCompletionDistance:
    "$completion = 1 - \\frac{remainingDistance}{initialDistance}$",
  taskCompletionCombined:
    "$completion = 0.7 \\cdot distanceScore + 0.3 \\cdot stepsScore$",
};
