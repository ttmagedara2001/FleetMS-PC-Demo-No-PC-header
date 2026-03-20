/**
 * @module useApi
 * @description React hook that exposes high-level API actions to UI components.
 *
 * In DEMO / frontend-only mode every action delegates to mockDataService
 * so no backend is required.  Replace the implementations inside each
 * function body to integrate a real API in production.
 */

import { useCallback } from "react";
import { updateStateDetails } from "../services/api";

/**
 * Hook providing fleet-level control actions.
 *
 * @returns {{
 *   emergencyStop: (deviceId: string) => Promise<void>,
 *   emergencyClear: (deviceId: string) => Promise<void>,
 * }}
 */
export function useApi() {
  /**
   * Broadcast an emergency-stop command to all robots on the device.
   * Writes an `emergencyStop: true` payload to both the device-level topic
   * and each individual robot's topic so every consumer receives it.
   *
   * @param {string} deviceId
   */
  const emergencyStop = useCallback(async (deviceId) => {
    if (!deviceId) return;
    const payload = {
      emergencyStop: true,
      stoppedAt: new Date().toISOString(),
      reason: "manual_user_stop",
    };
    await updateStateDetails(deviceId, "fleetMS/device/emergencyStop", payload);
  }, []);

  /**
   * Clear the emergency-stop state and allow robots to resume.
   *
   * @param {string} deviceId
   */
  const emergencyClear = useCallback(async (deviceId) => {
    if (!deviceId) return;
    const payload = {
      emergencyStop: false,
      clearedAt: new Date().toISOString(),
      reason: "manual_user_clear",
    };
    await updateStateDetails(deviceId, "fleetMS/device/emergencyStop", payload);
  }, []);

  return { emergencyStop, emergencyClear };
}

export default useApi;
