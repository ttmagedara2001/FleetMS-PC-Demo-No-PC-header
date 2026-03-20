/**
 * Shared Threshold Utility
 *
 * Single source of truth for reading user-defined threshold settings
 * from localStorage. Every component that needs to color-code sensors
 * (DeviceContext, DeviceEnvironmentPanel, RobotFleetPanel, Settings, etc.)
 * should import from here instead of duplicating getThresholdsLocal().
 */

// ── Fallback defaults (used when user has never saved settings) ──────────
export const DEFAULT_THRESHOLDS = {
  temperature: { min: 20, max: 40, critical: 44 },
  humidity: { min: 20, max: 70, critical: 85 },
  pressure: { min: 10, max: 40 },
  battery: { low: 20, critical: 10 },
  robotTemp: { min: 15, max: 45, critical: 49 },
};

/**
 * Read the threshold configuration from localStorage.
 * Priority:
 *   1. `parsed.thresholds` – the pre-built object saved by Settings page.
 *   2. Build from raw Settings fields (`parsed.temperature.min`, etc.).
 *   3. DEFAULT_THRESHOLDS.
 *
 * @returns {{ temperature, humidity, pressure, battery, robotTemp }}
 */
export function getThresholds() {
  try {
    const saved = localStorage.getItem("fabrix_settings");
    if (!saved) return DEFAULT_THRESHOLDS;

    const parsed = JSON.parse(saved);

    // 1️⃣  Pre-built thresholds (written by handleSaveDeviceSettings)
    if (parsed.thresholds) {
      return {
        temperature: {
          min:
            parsed.thresholds.temperature?.min ??
            DEFAULT_THRESHOLDS.temperature.min,
          max:
            parsed.thresholds.temperature?.max ??
            DEFAULT_THRESHOLDS.temperature.max,
          critical:
            parsed.thresholds.temperature?.critical ??
            DEFAULT_THRESHOLDS.temperature.critical,
        },
        humidity: {
          min:
            parsed.thresholds.humidity?.min ?? DEFAULT_THRESHOLDS.humidity.min,
          max:
            parsed.thresholds.humidity?.max ?? DEFAULT_THRESHOLDS.humidity.max,
          critical:
            parsed.thresholds.humidity?.critical ??
            DEFAULT_THRESHOLDS.humidity.critical,
        },
        pressure: {
          min:
            parsed.thresholds.pressure?.min ?? DEFAULT_THRESHOLDS.pressure.min,
          max:
            parsed.thresholds.pressure?.max ?? DEFAULT_THRESHOLDS.pressure.max,
        },
        battery: {
          low: parsed.thresholds.battery?.low ?? DEFAULT_THRESHOLDS.battery.low,
          critical:
            parsed.thresholds.battery?.critical ??
            DEFAULT_THRESHOLDS.battery.critical,
        },
        robotTemp: {
          min:
            parsed.robotThresholds?.tempMin ?? DEFAULT_THRESHOLDS.robotTemp.min,
          max:
            parsed.robotThresholds?.tempMax ?? DEFAULT_THRESHOLDS.robotTemp.max,
          critical:
            parsed.robotThresholds?.tempMax != null
              ? Number(parsed.robotThresholds.tempMax) + 4
              : DEFAULT_THRESHOLDS.robotTemp.critical,
        },
      };
    }

    // 2️⃣  Build from raw Settings fields
    const tMax = parsed.temperature?.max;
    const hMax = parsed.humidity?.max;
    const rtMax = parsed.robotThresholds?.tempMax;

    return {
      temperature: {
        min: parsed.temperature?.min ?? DEFAULT_THRESHOLDS.temperature.min,
        max: tMax ?? DEFAULT_THRESHOLDS.temperature.max,
        critical:
          tMax != null
            ? Number(tMax) + 4
            : DEFAULT_THRESHOLDS.temperature.critical,
      },
      humidity: {
        min: parsed.humidity?.min ?? DEFAULT_THRESHOLDS.humidity.min,
        max: hMax ?? DEFAULT_THRESHOLDS.humidity.max,
        critical:
          hMax != null
            ? Number(hMax) + 15
            : DEFAULT_THRESHOLDS.humidity.critical,
      },
      pressure: {
        min: parsed.pressure?.min ?? DEFAULT_THRESHOLDS.pressure.min,
        max: parsed.pressure?.max ?? DEFAULT_THRESHOLDS.pressure.max,
      },
      battery: {
        low: parsed.battery?.min ?? DEFAULT_THRESHOLDS.battery.low,
        critical:
          parsed.battery?.critical ?? DEFAULT_THRESHOLDS.battery.critical,
      },
      robotTemp: {
        min:
          parsed.robotThresholds?.tempMin ?? DEFAULT_THRESHOLDS.robotTemp.min,
        max: rtMax ?? DEFAULT_THRESHOLDS.robotTemp.max,
        critical:
          rtMax != null
            ? Number(rtMax) + 4
            : DEFAULT_THRESHOLDS.robotTemp.critical,
      },
    };
  } catch (error) {
    console.error("[Thresholds] ❌ Failed to read settings:", error);
    return DEFAULT_THRESHOLDS;
  }
}

// ── Severity helpers ─────────────────────────────────────────────────────

/** Device ambient temperature severity */
export function getTemperatureStatus(temp) {
  if (temp == null) return "normal";
  const t = getThresholds().temperature;
  if (temp > t.critical) return "critical";
  if (temp > t.max || temp < t.min) return "warning";
  return "normal";
}

/** Device ambient humidity severity */
export function getHumidityStatus(hum) {
  if (hum == null) return "normal";
  const t = getThresholds().humidity;
  if (hum > t.critical) return "critical";
  if (hum > t.max || hum < t.min) return "warning";
  return "normal";
}

/** Device atmospheric pressure severity */
export function getPressureStatus(pressure) {
  if (pressure == null) return "normal";
  const t = getThresholds().pressure;
  if (pressure < t.min || pressure > t.max) return "critical";
  return "normal";
}

/** Robot body/motor temperature severity */
export function getRobotTempStatus(temp) {
  if (temp == null) return "normal";
  const t = getThresholds().robotTemp;
  if (temp > t.critical) return "critical";
  if (temp < t.min) return "critical";
  if (temp > t.max) return "warning";
  return "normal";
}

/** Robot battery severity (uses user-defined warning & critical levels) */
export function getBatteryStatus(pct) {
  if (pct == null) return "normal";
  const t = getThresholds().battery;
  if (pct <= t.critical) return "critical";
  if (pct <= t.low) return "warning";
  return "normal";
}

/**
 * Compute a robot health object from battery percentage,
 * using user-defined thresholds for label assignment.
 *
 * @param {number} batteryPct  0-100
 * @returns {{ score: number, label: string, pct: number, status: string }}
 */
export function computeRobotHealthFromSettings(batteryPct) {
  const pct = Math.round(Math.max(0, Math.min(100, Number(batteryPct) || 0)));
  const score = +(pct / 100).toFixed(3);
  const t = getThresholds().battery;

  let label = "Unknown";
  let status = "normal";

  if (pct <= t.critical) {
    label = "Critical";
    status = "critical";
  } else if (pct <= t.low) {
    label = "Low";
    status = "warning";
  } else if (pct <= t.low + 20) {
    label = "Fair";
    status = "normal";
  } else {
    label = "Good";
    status = "normal";
  }

  return { score, label, pct, status };
}
