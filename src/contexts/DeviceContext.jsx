import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { connectWebSocket } from '../services/webSocketClient';
import { getStateDetails, updateStateDetails, getTopicStreamData, getTopicStateDetails, getTimeRange } from '../services/api';
import { getRobotsForDevice, DEFAULT_ROBOT_SENSOR_DATA, ROBOT_STATUS } from '../config/robotRegistry';
import { FACTORY_LOCATIONS, ALL_DEVICES, getFactoryForDevice } from '../config/factoryRegistry';
import {
    TASK_PHASES, PHASE_LABELS,
    haversineDistance, ARRIVAL_THRESHOLD_M, COLLISION_THRESHOLD_M, AUTO_ADVANCE_DELAY_MS,
    computePhaseProgress, isInsideRoom, findRoomAtPoint, resolveRoom, ROOMS
} from '../utils/telemetryMath';
import { getThresholds } from '../utils/thresholds';
import {
    getEnvironmentSnapshot,
    getRobotsSnapshot,
    generateEnvHistory,
    generateRobotHistory,
    registerActiveTask,
    clearActiveTask,
    updateActiveTaskPhase,
} from '../services/mockDataService';

const DeviceContext = createContext(null);

// Helper function to check if a task status/phase represents an active (non-completed) task
const isActiveTaskStatus = (status) => {
    if (!status) return false;
    const s = String(status).toLowerCase();
    return s === 'assigned' || s === 'pending' || s === 'in progress' || s === 'in_progress' ||
        s === 'active' || s === 'moving' || s === 'started' || s === 'queued' || s === 'scheduled' ||
        // Phase-based statuses (Deliver-only)
        s === 'en_route_to_source' || s === 'picking_up' ||
        s === 'en_route_to_destination' || s === 'delivering';
};

const DEFAULT_DEVICE_STATE = {
    environment: {
        ambient_temp: null,
        ambient_hum: null,
        atmospheric_pressure: null
    },
    state: {
        ac_power: null,
        air_purifier: null,
        status: null,
        gateway_health: null,
        active_alert: null,
        wifi_rssi: null
    },
    taskSummary: null,
    lastUpdate: null
};

// Default thresholds (fallback if no settings saved)
const DEFAULT_THRESHOLDS = {
    temperature: { min: 18, max: 28, critical: 32 },
    humidity: { min: 30, max: 60, critical: 75 },
    battery: { low: 20, critical: 10 },
    pressure: { min: 980, max: 1040 }
};

// Re-export getThresholds from shared utility — all threshold reads go through thresholds.js

export function DeviceProvider({ children }) {
    const { token, isAuthenticated } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    // WebSocket connection state managed near bottom of file


    // Load persisted state from localStorage
    const [selectedDeviceId, setSelectedDeviceId] = useState(() => {
        try {
            const saved = localStorage.getItem('fabrix_selectedDeviceId');
            if (saved && ALL_DEVICES.some(d => d.id === saved)) {
                return saved;
            }
        } catch (e) {
            console.error('[Device] Failed to load selectedDeviceId:', e);
        }
        return ALL_DEVICES[0].id;
    });

    const [selectedFactoryId, setSelectedFactoryId] = useState(() => {
        try {
            const savedFactory = localStorage.getItem('fabrix_selectedFactoryId');
            if (savedFactory && FACTORY_LOCATIONS.some(factory => factory.id === savedFactory)) {
                return savedFactory;
            }

            const savedDevice = localStorage.getItem('fabrix_selectedDeviceId');
            if (savedDevice) {
                const factory = getFactoryForDevice(savedDevice);
                if (factory) return factory.id;
            }
        } catch (e) {
            console.error('[Device] Failed to load selectedFactoryId:', e);
        }
        return FACTORY_LOCATIONS[0].id;
    });

    const devices = useMemo(
        () => ALL_DEVICES.filter(device => device.factoryId === selectedFactoryId),
        [selectedFactoryId]
    );

    const [deviceData, setDeviceData] = useState(() => {
        // Pre-populate with mock environment readings for demo
        const initial = {};
        ALL_DEVICES.forEach(device => {
            const envSnap = getEnvironmentSnapshot(device.id);
            initial[device.id] = {
                ...DEFAULT_DEVICE_STATE,
                environment: {
                    ambient_temp: envSnap.ambient_temp,
                    ambient_hum: envSnap.ambient_hum,
                    atmospheric_pressure: envSnap.atmospheric_pressure,
                },
                state: {
                    ac_power: 'OFF',
                    air_purifier: 'INACTIVE',
                    status: 'Online',
                    gateway_health: 'Healthy',
                    active_alert: null,
                    wifi_rssi: -45,
                },
                lastUpdate: Date.now(),
            };
        });
        return initial;
    });

    // Initialize robots state with mock data from MockDataService
    const [robots, setRobots] = useState(() => {
        const robotState = {};
        ALL_DEVICES.forEach(device => {
            // Get pre-built mock robot data with realistic positions/battery/temp
            const mockRobots = getRobotsSnapshot(device.id);
            robotState[device.id] = {};
            Object.entries(mockRobots).forEach(([robotId, mockRobot]) => {
                robotState[device.id][robotId] = {
                    ...mockRobot,
                    task: null,
                    taskQueue: [],
                    lastUpdate: Date.now(),
                };
            });
        });
        return robotState;
    });

    // Stable ref so polling effects can read robot IDs without triggering dep-array re-registration.
    // This prevents the poller from restarting on every 3-second WebSocket robot location update.
    const robotsRef = useRef(null);
    useEffect(() => { robotsRef.current = robots; }, [robots]);

    const [alerts, setAlerts] = useState(() => {
        try {
            const saved = localStorage.getItem('fabrix_alerts');
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.error('[Device] Failed to load alerts:', e);
        }
        return [];
    });

    // Time-series histories for Analysis graphs/tables — pre-populated with mock data
    const [envHistory, setEnvHistory] = useState(() => {
        const h = {};
        ALL_DEVICES.forEach(d => {
            h[d.id] = generateEnvHistory(d.id, 24, 200);
        });
        return h;
    });

    const [robotHistory, setRobotHistory] = useState(() => {
        const rh = {};
        ALL_DEVICES.forEach(d => {
            rh[d.id] = generateRobotHistory(d.id, 24, 100);
        });
        return rh;
    });

    // Task update version counter - increments when a task is updated via API
    // Components can watch this to trigger refreshes
    const [taskUpdateVersion, setTaskUpdateVersion] = useState(0);

    // Store fetched robot tasks from API (keyed by robotId)
    const [fetchedRobotTasks, setFetchedRobotTasks] = useState({});

    // Persistent local task history — accumulates ALL allocated tasks so none are lost
    // Structure: { [deviceId]: { [robotId]: TaskEntry[] } }
    const taskHistoryRef = useRef(() => {
        try {
            const stored = localStorage.getItem('fabrix_task_history');
            return stored ? JSON.parse(stored) : {};
        } catch { return {}; }
    });
    // Initialize ref on first render
    if (typeof taskHistoryRef.current === 'function') {
        taskHistoryRef.current = taskHistoryRef.current();
    }

    // Getter for local task history (used by Analysis page)
    const getLocalTaskHistory = useCallback((deviceId) => {
        return taskHistoryRef.current[deviceId] || {};
    }, []);

    // Function to notify that a task was updated
    const notifyTaskUpdate = useCallback(() => {
        setTaskUpdateVersion(v => v + 1);
    }, []);

    // Throttle timestamps for automatic control actions per device
    const autoActionTimestamps = useRef({});
    // Throttle collision alerts — key = sorted robot pair, value = last alert timestamp
    const collisionAlertThrottle = useRef({});
    // Ref to always hold latest refreshDeviceState for callbacks that can't include it in deps
    const refreshDeviceStateRef = useRef(null);



    // Persist selectedDeviceId to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('fabrix_selectedDeviceId', selectedDeviceId);
        } catch (e) {
            console.error('[Device] Failed to save selectedDeviceId:', e);
        }
    }, [selectedDeviceId]);

    useEffect(() => {
        try {
            localStorage.setItem('fabrix_selectedFactoryId', selectedFactoryId);
        } catch (e) {
            console.error('[Device] Failed to save selectedFactoryId:', e);
        }
    }, [selectedFactoryId]);

    // Keep selected device in sync with currently selected factory.
    useEffect(() => {
        if (!devices.length) return;
        if (!devices.some(device => device.id === selectedDeviceId)) {
            setSelectedDeviceId(devices[0].id);
        }
    }, [devices, selectedDeviceId]);

    // Note: deviceData and robots are NO LONGER persisted to localStorage
    // to ensure dashboard starts fresh on reload as requested.

    // Persist alerts to localStorage (debounced)
    useEffect(() => {
        const timeout = setTimeout(() => {
            try {
                localStorage.setItem('fabrix_alerts', JSON.stringify(alerts));
            } catch (e) {
                console.error('[Device] Failed to save alerts:', e);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [alerts]);

    // Fetch initial device state from API on device selection change
    useEffect(() => {
        const fetchInitialState = async () => {
            if (!selectedDeviceId || !isAuthenticated) return;

            try {
                const response = await getStateDetails(selectedDeviceId);

                if (response.status === 'Success' && response.data) {

                    // Update device state with API data
                    setDeviceData(prev => ({
                        ...prev,
                        [selectedDeviceId]: {
                            ...prev[selectedDeviceId],
                            state: {
                                ...prev[selectedDeviceId]?.state,
                                ac_power: response.data.ac?.status ?? response.data.ac?.payload?.status ?? prev[selectedDeviceId]?.state?.ac_power,
                                air_purifier: response.data.airPurifier?.status ?? response.data.airPurifier?.payload?.status ?? prev[selectedDeviceId]?.state?.air_purifier,
                                status: response.data.status?.status ?? response.data.status?.payload?.status ?? prev[selectedDeviceId]?.state?.status,
                                gateway_health: response.data.status?.gateway_health ?? prev[selectedDeviceId]?.state?.gateway_health
                            },
                            lastUpdate: Date.now()
                        }
                    }));
                }
            } catch (error) {
                console.error('[Device] Failed to fetch initial state:', error);
                // Continue with WebSocket updates - API fetch is optional
            }
        };

        fetchInitialState();
    }, [selectedDeviceId, isAuthenticated]);

    // Get current device data
    const currentFactory = FACTORY_LOCATIONS.find(factory => factory.id === selectedFactoryId) || FACTORY_LOCATIONS[0];
    const currentDevice = ALL_DEVICES.find(d => d.id === selectedDeviceId);
    const currentDeviceData = deviceData[selectedDeviceId] || DEFAULT_DEVICE_STATE;

    // Ensure currentRobots always contains registry robots (at least 5)
    const currentRobots = useMemo(() => {
        const stateRobots = robots[selectedDeviceId] || {};
        const registryRobots = getRobotsForDevice(selectedDeviceId);

        const merged = { ...stateRobots };

        // Ensure all registry robots are present
        registryRobots.forEach(regRobot => {
            if (!merged[regRobot.id]) {
                merged[regRobot.id] = {
                    ...regRobot,
                    ...DEFAULT_ROBOT_SENSOR_DATA,
                    task: null,
                    lastUpdate: Date.now()
                };
            }
        });

        return merged;
    }, [robots, selectedDeviceId]);

    // Add alert with deduplication
    const addAlert = useCallback((alert) => {
        setAlerts(prev => {
            // Deduplicate by message within last 30 seconds
            const isDuplicate = prev.some(
                a => a.message === alert.message &&
                    Date.now() - a.timestamp < 30000
            );

            if (isDuplicate) return prev;

            const newAlert = {
                ...alert,
                id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                read: false
            };



            // Keep only last 50 alerts
            return [newAlert, ...prev].slice(0, 50);
        });
    }, []);

    // Severity computation for environment values (used by UI to color values)
    const computeEnvSeverity = useCallback((payload) => {
        const thresholds = getThresholds();
        const temp = payload.temperature ?? payload.temp ?? payload.ambient_temp;
        const hum = payload.humidity ?? payload.ambient_hum;
        const pressure = payload.pressure ?? payload.atmospheric_pressure;

        const result = { temperature: 'good', humidity: 'good', pressure: 'good' };

        if (temp != null) {
            if (temp > thresholds.temperature.critical) result.temperature = 'critical';
            else if (temp > thresholds.temperature.max || temp < thresholds.temperature.min) result.temperature = 'warning';
        }
        if (hum != null) {
            if (hum > thresholds.humidity.critical) result.humidity = 'critical';
            else if (hum > thresholds.humidity.max || hum < thresholds.humidity.min) result.humidity = 'warning';
        }
        if (pressure != null) {
            if (pressure > thresholds.pressure.max || pressure < thresholds.pressure.min) result.pressure = 'warning';
        }
        return result;
    }, []);

    // Add environment datapoint to envHistory (bounded length)
    const addEnvHistory = useCallback((deviceId, payload) => {
        setEnvHistory(prev => {
            const deviceSeries = prev[deviceId] ? [...prev[deviceId]] : [];
            deviceSeries.unshift({ ts: Date.now(), temperature: payload.temperature ?? payload.temp ?? payload.ambient_temp ?? null, humidity: payload.humidity ?? payload.ambient_hum ?? null, pressure: payload.pressure ?? payload.atmospheric_pressure ?? null });
            if (deviceSeries.length > 500) deviceSeries.length = 500;
            return { ...prev, [deviceId]: deviceSeries };
        });
    }, []);

    // Add robot metric datapoint to robotHistory (bounded length)
    const addRobotHistory = useCallback((deviceId, robotId, metric, value) => {
        setRobotHistory(prev => {
            const deviceObj = { ...(prev[deviceId] || {}) };
            const series = deviceObj[robotId] ? [...deviceObj[robotId]] : [];
            series.unshift({ ts: Date.now(), metric, value });
            if (series.length > 500) series.length = 500;
            deviceObj[robotId] = series;
            return { ...prev, [deviceId]: deviceObj };
        });
    }, []);

    // Compute robot severity (battery/temp) to help UI colorization
    const computeRobotSeverity = useCallback((robot) => {
        const thresholds = getThresholds();
        const sev = { battery: 'good', temp: 'good' };
        const batt = robot?.status?.battery;
        const temp = robot?.environment?.temp;
        if (batt != null) {
            if (batt <= thresholds.battery.critical) sev.battery = 'critical';
            else if (batt <= thresholds.battery.low) sev.battery = 'warning';
        }
        if (temp != null) {
            // Use configured thresholds: below min or above max => warning; above critical => critical
            if (temp > thresholds.temperature.critical) {
                sev.temp = 'critical';
            } else if (temp > thresholds.temperature.max || temp < thresholds.temperature.min) {
                sev.temp = 'warning';
            }
        }
        return sev;
    }, []);

    // Handle device temperature updates
    const handleTemperatureUpdate = useCallback((deviceId, payload) => {
        // Compute severity outside setState so the updater stays pure — no closure over stale state.
        const severity = computeEnvSeverity(payload);

        // Single setState call: merges env values + severity to prevent a double re-render per tick.
        setDeviceData(prev => ({
            ...prev,
            [deviceId]: {
                ...prev[deviceId],
                environment: {
                    ...prev[deviceId]?.environment,
                    ambient_temp: payload.temperature ?? payload.temp ?? payload.ambient_temp ?? prev[deviceId]?.environment?.ambient_temp,
                    ambient_hum: payload.humidity ?? payload.ambient_hum ?? prev[deviceId]?.environment?.ambient_hum,
                    atmospheric_pressure: payload.pressure ?? payload.atmospheric_pressure ?? prev[deviceId]?.environment?.atmospheric_pressure,
                    severity,
                },
                lastUpdate: Date.now()
            }
        }));

        // Append to environment history for analysis
        try { addEnvHistory(deviceId, payload); } catch (e) { /* ignore */ }

        // Get thresholds from localStorage
        const thresholds = getThresholds();
        const temp = payload.temperature ?? payload.temp ?? payload.ambient_temp;

        // Check for temperature threshold violations
        if (temp != null) {
            if (temp > thresholds.temperature.critical) {
                addAlert({
                    type: 'critical',
                    deviceId,
                    message: `CRITICAL: Temperature at ${temp}°C exceeds ${thresholds.temperature.critical}°C`,
                    timestamp: Date.now()
                });
            } else if (temp > thresholds.temperature.max) {
                addAlert({
                    type: 'warning',
                    deviceId,
                    message: `High temperature detected: ${temp}°C (max: ${thresholds.temperature.max}°C)`,
                    timestamp: Date.now()
                });
            } else if (temp < thresholds.temperature.min) {
                addAlert({
                    type: 'warning',
                    deviceId,
                    message: `Low temperature detected: ${temp}°C (min: ${thresholds.temperature.min}°C)`,
                    timestamp: Date.now()
                });
            }
        }

        // Check for humidity threshold violations
        const humidity = payload.humidity ?? payload.ambient_hum;
        if (humidity != null) {
            if (humidity > thresholds.humidity.critical) {
                addAlert({
                    type: 'critical',
                    deviceId,
                    message: `CRITICAL: Humidity at ${humidity}% exceeds ${thresholds.humidity.critical}%`,
                    timestamp: Date.now()
                });
            } else if (humidity > thresholds.humidity.max) {
                addAlert({
                    type: 'warning',
                    deviceId,
                    message: `High humidity detected: ${humidity}% (max: ${thresholds.humidity.max}%)`,
                    timestamp: Date.now()
                });
            } else if (humidity < thresholds.humidity.min) {
                addAlert({
                    type: 'warning',
                    deviceId,
                    message: `Low humidity detected: ${humidity}% (min: ${thresholds.humidity.min}%)`,
                    timestamp: Date.now()
                });
            }
        }

        // Check for pressure threshold violations
        const pressure = payload.pressure ?? payload.atmospheric_pressure;
        if (pressure != null) {
            if (pressure > thresholds.pressure.max || pressure < thresholds.pressure.min) {
                addAlert({
                    type: 'warning',
                    deviceId,
                    message: `Abnormal pressure detected: ${pressure} hPa (range: ${thresholds.pressure.min}-${thresholds.pressure.max} hPa)`,
                    timestamp: Date.now()
                });
            }
        }

        // Auto-control logic: if system mode is AUTOMATIC, trigger AC / Air Purifier updates
        try {
            const saved = localStorage.getItem('fabrix_settings');
            const parsed = saved ? JSON.parse(saved) : {};
            const mode = parsed.systemMode || 'MANUAL';

            if (mode === 'AUTOMATIC') {
                // Throttle auto actions per device
                const now = Date.now();
                const last = autoActionTimestamps.current[deviceId] || 0;
                if (now - last > 30000) { // 30s throttle
                    autoActionTimestamps.current[deviceId] = now;

                    // Decide AC state
                    const temp = payload.temperature ?? payload.temp ?? payload.ambient_temp;
                    if (temp != null) {
                        // NOTE: Auto behavior: when temperature is BELOW min, enable AC (turn ON)
                        // and when temperature is ABOVE max, disable AC (turn OFF).
                        // This treats AC as the actuator used to heat when low; adjust if your device
                        // interprets ON/OFF the other way around.
                        if (temp < thresholds.temperature.min) {
                            // Turn AC ON (temperature is low)
                            (async () => {
                                try {
                                    await updateStateDetails(deviceId, 'fleetMS/ac', { status: 'ON' });
                                    if (refreshDeviceStateRef.current) await refreshDeviceStateRef.current();
                                } catch (err) {
                                    console.error('[AutoControl] Failed to set AC ON', err);
                                }
                            })();
                        } else if (temp > thresholds.temperature.max) {
                            // Turn AC OFF (temperature is high)
                            (async () => {
                                try {
                                    await updateStateDetails(deviceId, 'fleetMS/ac', { status: 'OFF' });
                                    if (refreshDeviceStateRef.current) await refreshDeviceStateRef.current();
                                } catch (err) {
                                    console.error('[AutoControl] Failed to set AC OFF', err);
                                }
                            })();
                        }
                    }

                    // Decide Air Purifier state based on humidity or active alerts
                    const hum = payload.humidity ?? payload.ambient_hum;
                    const hasAlert = payload.alert || payload.active_alert;
                    if (hum != null) {
                        if (hum > thresholds.humidity.max || hasAlert) {
                            (async () => {
                                try {
                                    await updateStateDetails(deviceId, 'fleetMS/airPurifier', { status: 'ACTIVE' });
                                    if (refreshDeviceStateRef.current) await refreshDeviceStateRef.current();
                                } catch (err) {
                                    console.error('[AutoControl] Failed to set Air Purifier ACTIVE', err);
                                }
                            })();
                        } else if (hum < thresholds.humidity.min) {
                            (async () => {
                                try {
                                    await updateStateDetails(deviceId, 'fleetMS/airPurifier', { status: 'INACTIVE' });
                                    if (refreshDeviceStateRef.current) await refreshDeviceStateRef.current();
                                } catch (err) {
                                    console.error('[AutoControl] Failed to set Air Purifier INACTIVE', err);
                                }
                            })();
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[AutoControl] Error evaluating automatic controls', err);
        }
    }, [addAlert, addEnvHistory, computeEnvSeverity]);

    // Handle AC state updates
    const handleACUpdate = useCallback((deviceId, payload) => {
        setDeviceData(prev => ({
            ...prev,
            [deviceId]: {
                ...prev[deviceId],
                state: {
                    ...prev[deviceId]?.state,
                    ac_power: payload.status ?? payload.state ?? payload.ac_power ?? prev[deviceId]?.state?.ac_power
                },
                lastUpdate: Date.now()
            }
        }));
    }, []);

    // Handle device status updates
    const handleDeviceStatusUpdate = useCallback((deviceId, payload) => {
        setDeviceData(prev => ({
            ...prev,
            [deviceId]: {
                ...prev[deviceId],
                state: {
                    ...prev[deviceId]?.state,
                    status: payload.status ?? payload.state ?? prev[deviceId]?.state?.status,
                    gateway_health: payload.gateway_health ?? payload.health ?? prev[deviceId]?.state?.gateway_health,
                    wifi_rssi: payload.wifi_rssi ?? payload.rssi ?? prev[deviceId]?.state?.wifi_rssi,
                    active_alert: payload.alert ?? payload.active_alert ?? prev[deviceId]?.state?.active_alert
                },
                lastUpdate: Date.now()
            }
        }));

        // Check for active alerts from status
        if (payload.alert || payload.active_alert) {
            addAlert({
                type: 'critical',
                deviceId,
                message: payload.alert || payload.active_alert,
                timestamp: Date.now()
            });
        }
    }, [addAlert, computeRobotSeverity, addRobotHistory]);

    // Handle air purifier state updates
    const handleAirPurifierUpdate = useCallback((deviceId, payload) => {
        setDeviceData(prev => ({
            ...prev,
            [deviceId]: {
                ...prev[deviceId],
                state: {
                    ...prev[deviceId]?.state,
                    air_purifier: payload.status ?? payload.state ?? payload.air_purifier ?? prev[deviceId]?.state?.air_purifier
                },
                lastUpdate: Date.now()
            }
        }));
    }, []);

    // Handle robot discovery from device stream
    const handleRobotsDiscovery = useCallback((deviceId, payload) => {
        // Payload could be array of robot IDs or object with robots array
        const robotIds = Array.isArray(payload) ? payload :
            (payload.robots ? payload.robots :
                (payload.robotIds ? payload.robotIds : []));

        robotIds.forEach(robotId => {
            const id = typeof robotId === 'string' ? robotId : robotId.id || robotId.robotId;
            if (id) {
                registerRobot(deviceId, id);
            }
        });

        // Also update task summary if present
        if (payload.tasks || payload.task_summary) {
            setDeviceData(prev => ({
                ...prev,
                [deviceId]: {
                    ...prev[deviceId],
                    taskSummary: payload.tasks || payload.task_summary,
                    lastUpdate: Date.now()
                }
            }));
        }
    }, []);

    // Register a robot and subscribe to its streams
    const registerRobot = useCallback((deviceId, robotId) => {


        setRobots(prev => {
            if (prev[deviceId]?.[robotId]) {

                return prev;
            }

            return {
                ...prev,
                [deviceId]: {
                    ...prev[deviceId],
                    [robotId]: {
                        id: robotId,
                        location: { lat: null, lng: null, z: 0 },
                        heading: 0,
                        environment: { temp: null, humidity: null },
                        status: { battery: null, load: null, state: 'READY' },
                        task: null,
                        lastUpdate: null
                    }
                }
            };
        });
    }, []);

    // Handle robot location updates
    const handleRobotLocationUpdate = useCallback((deviceId, robotId, payload) => {
        setRobots(prev => {
            const deviceRobots = prev[deviceId] || {};
            const existingRobot = deviceRobots[robotId] || {
                id: robotId,
                location: { lat: null, lng: null, z: 0 },
                heading: 0,
                status: { state: 'READY', battery: 100 },
                environment: { temp: null, humidity: null },
                task: null
            };

            const newLat = payload.lat ?? payload.latitude ?? (payload.location?.lat) ?? existingRobot.location?.lat;
            const newLng = payload.lng ?? payload.longitude ?? (payload.location?.lng) ?? existingRobot.location?.lng;

            // Only log when location actually changes
            const prevLat = existingRobot.location?.lat;
            const prevLng = existingRobot.location?.lng;
            if (newLat != null && newLng != null && (newLat !== prevLat || newLng !== prevLng)) {
            }

            // ===== MULTI-PHASE TASK TRACKING =====
            const currentTask = existingRobot.task;
            let updatedTask = currentTask;

            // Skip phase progression if robot is BLOCKED due to collision
            const isBlocked = existingRobot.status?.state === 'BLOCKED' || currentTask?.paused;

            if (currentTask && currentTask.phase && currentTask.phase !== TASK_PHASES.COMPLETED && currentTask.phase !== TASK_PHASES.FAILED && !isBlocked) {
                // Room names for geofence checking (fuzzy-matched via resolveRoom)
                const rawSrcRoom = currentTask['initiate location'] || currentTask.source_name || null;
                const rawDstRoom = currentTask.destination || currentTask.destination_name || null;
                const srcResolved = resolveRoom(rawSrcRoom);
                const dstResolved = resolveRoom(rawDstRoom);
                const srcRoomName = srcResolved?.name ?? null;
                const dstRoomName = dstResolved?.name ?? null;

                // Resolve GPS — fall back to ROOMS center when explicit lat/lng missing
                const srcCenter = srcResolved?.room.center ?? null;
                const dstCenter = dstResolved?.room.center ?? null;
                const srcLat = currentTask.source_lat ?? currentTask.src_lat ?? srcCenter?.lat ?? null;
                const srcLng = currentTask.source_lng ?? currentTask.src_lng ?? srcCenter?.lng ?? null;
                const dstLat = currentTask.destination_lat ?? currentTask.dest_lat ?? dstCenter?.lat ?? null;
                const dstLng = currentTask.destination_lng ?? currentTask.dest_lng ?? dstCenter?.lng ?? null;
                const phase = currentTask.phase;

                // Helper: check if robot arrived at a target (room geofence OR distance threshold)
                const hasArrived = (targetLat, targetLng, roomName) => {
                    if (newLat == null || newLng == null) return false;
                    // 1. Room geofence check — if the room is known
                    if (roomName && isInsideRoom(newLat, newLng, roomName)) return true;
                    // 2. Haversine distance fallback
                    if (targetLat != null && targetLng != null) {
                        return haversineDistance(newLat, newLng, targetLat, targetLng) <= ARRIVAL_THRESHOLD_M;
                    }
                    return false;
                };

                // --- Phase: EN_ROUTE_TO_SOURCE → check proximity to source ---
                if (phase === TASK_PHASES.EN_ROUTE_TO_SOURCE && (srcLat != null || srcRoomName) && newLat != null && newLng != null) {
                    const arrivedAtSource = hasArrived(srcLat, srcLng, srcRoomName);

                    if (arrivedAtSource) {
                        // Arrived at source — start PICKING_UP
                        updatedTask = {
                            ...currentTask,
                            phase: TASK_PHASES.PICKING_UP,
                            sourceArrivedAt: Date.now(),
                            progress: 45
                        };
                        // Sync phase to mock service so robot stays at source during pickup
                        updateActiveTaskPhase(deviceId, robotId, TASK_PHASES.PICKING_UP);

                        addAlert({
                            type: 'info', deviceId, robotId,
                            message: `📍 ${robotId} arrived at pickup: ${currentTask['initiate location'] || 'source'}`,
                            timestamp: Date.now()
                        });

                        // Auto-advance: PICKING_UP → EN_ROUTE_TO_DESTINATION
                        setTimeout(() => {
                            setRobots(p => {
                                const r = p[deviceId]?.[robotId];
                                if (!r?.task || r.task.phase !== TASK_PHASES.PICKING_UP) return p;
                                addAlert({
                                    type: 'info', deviceId, robotId,
                                    message: `🚚 ${robotId} picked up, heading to: ${currentTask.destination || 'destination'}`,
                                    timestamp: Date.now()
                                });
                                // Sync phase to mock service so robot starts moving toward destination
                                updateActiveTaskPhase(deviceId, robotId, TASK_PHASES.EN_ROUTE_TO_DESTINATION);
                                return {
                                    ...p,
                                    [deviceId]: { ...p[deviceId], [robotId]: { ...r, task: { ...r.task, phase: TASK_PHASES.EN_ROUTE_TO_DESTINATION, pickedUpAt: Date.now(), progress: 50 } } }
                                };
                            });
                        }, AUTO_ADVANCE_DELAY_MS);

                    } else {
                        // Update progress while en route
                        const newProgress = computePhaseProgress(currentTask, newLat, newLng);
                        if (newProgress !== currentTask.progress) {
                            updatedTask = { ...currentTask, progress: newProgress };
                        }
                    }
                }

                // --- Phase: EN_ROUTE_TO_DESTINATION → check proximity to destination ---
                else if (phase === TASK_PHASES.EN_ROUTE_TO_DESTINATION && (dstLat != null || dstRoomName) && newLat != null && newLng != null) {
                    const arrivedAtDest = hasArrived(dstLat, dstLng, dstRoomName);

                    if (arrivedAtDest) {
                        // Arrived at destination — start DELIVERING
                        updatedTask = {
                            ...currentTask,
                            phase: TASK_PHASES.DELIVERING,
                            destinationArrivedAt: Date.now(),
                            progress: 92
                        };
                        // Sync phase to mock service so robot stays at destination during delivery
                        updateActiveTaskPhase(deviceId, robotId, TASK_PHASES.DELIVERING);

                        addAlert({
                            type: 'info', deviceId, robotId,
                            message: `📍 ${robotId} arrived at destination: ${currentTask.destination || 'drop-off'}`,
                            timestamp: Date.now()
                        });

                        // Auto-advance: DELIVERING → COMPLETED
                        setTimeout(() => {
                            setRobots(p => {
                                const r = p[deviceId]?.[robotId];
                                if (!r?.task || r.task.phase !== TASK_PHASES.DELIVERING) return p;
                                const taskId = r.task.task_id || r.task.taskId || 'unknown';

                                addAlert({
                                    type: 'info', deviceId, robotId,
                                    message: `✅ ${robotId} completed delivery ${taskId} (${currentTask['initiate location'] || '?'} → ${currentTask.destination || '?'})`,
                                    timestamp: Date.now()
                                });

                                // Send completion to backend
                                (async () => {
                                    try {
                                        await updateStateDetails(deviceId, `fleetMS/robots/${robotId}/task`, {
                                            task_id: r.task.task_id || r.task.taskId,
                                            task_type: 'Deliver',
                                            status: 'Completed',
                                            phase: TASK_PHASES.COMPLETED,
                                            progress: 100,
                                            completedAt: new Date().toISOString(),
                                            sourceArrivedAt: r.task.sourceArrivedAt ? new Date(r.task.sourceArrivedAt).toISOString() : null,
                                            pickedUpAt: r.task.pickedUpAt ? new Date(r.task.pickedUpAt).toISOString() : null,
                                            destinationArrivedAt: new Date().toISOString(),
                                            robotId
                                        });
                                        notifyTaskUpdate();
                                    } catch (err) {
                                        console.error(`[Device] Failed to send completion for ${robotId}:`, err);
                                    }
                                })();

                                // Clear active task from mock service so robot stops navigating
                                clearActiveTask(deviceId, robotId);
                                return {
                                    ...p,
                                    [deviceId]: {
                                        ...p[deviceId],
                                        [robotId]: {
                                            ...r,
                                            task: { ...r.task, phase: TASK_PHASES.COMPLETED, status: 'Completed', progress: 100, completedAt: Date.now() },
                                            status: { ...r.status, state: 'READY' }
                                        }
                                    }
                                };
                            });

                            // Clear task after showing completion, then dequeue next
                            setTimeout(() => {
                                setRobots(p => {
                                    const r = p[deviceId]?.[robotId];
                                    if (!r?.task || r.task.phase !== TASK_PHASES.COMPLETED) return p;

                                    // If there are queued tasks, dequeue the next one
                                    const queue = r.taskQueue || [];
                                    if (queue.length > 0) {
                                        const [nextTask, ...remaining] = queue;
                                        setTimeout(() => {
                                            // Strip stale execution state so dequeued task always starts fresh at 0%
                                            const { phase: _p, progress: _pr, sourceArrivedAt: _sa, pickedUpAt: _pu,
                                                destinationArrivedAt: _da, deliveredAt: _de, completedAt: _ca, ...freshTask } = nextTask;
                                            handleRobotTaskUpdate(deviceId, robotId, { ...freshTask, status: 'Assigned', assignedAt: new Date().toISOString() });
                                            notifyTaskUpdate();
                                        }, 500);
                                        return {
                                            ...p,
                                            [deviceId]: { ...p[deviceId], [robotId]: { ...r, task: null, taskQueue: remaining, status: { ...r.status, state: 'READY' } } }
                                        };
                                    }

                                    return {
                                        ...p,
                                        [deviceId]: { ...p[deviceId], [robotId]: { ...r, task: null, status: { ...r.status, state: 'READY' } } }
                                    };
                                });
                            }, 8000);
                        }, AUTO_ADVANCE_DELAY_MS);

                    } else {
                        // Update progress while en route
                        const newProgress = computePhaseProgress(currentTask, newLat, newLng);
                        if (newProgress !== currentTask.progress) {
                            updatedTask = { ...currentTask, progress: newProgress };
                        }
                    }
                }

                // --- PICKING_UP phase — no GPS action needed, auto-timers handle it ---
            }
            // Legacy fallback: task without phase system
            else if (currentTask && !currentTask.phase && currentTask.status !== 'Completed' && currentTask.status !== 'completed') {
                const legacyDstRoom = currentTask.destination || currentTask.destination_name || null;
                const legacyDstResolved = resolveRoom(legacyDstRoom);
                const legacyDstCenter = legacyDstResolved?.room.center ?? null;
                const dstLat = currentTask.destination_lat ?? currentTask.dest_lat ?? currentTask.end_lat ?? legacyDstCenter?.lat ?? null;
                const dstLng = currentTask.destination_lng ?? currentTask.dest_lng ?? currentTask.end_lng ?? legacyDstCenter?.lng ?? null;
                if (dstLat != null && dstLng != null && newLat != null && newLng != null) {
                    const dist = haversineDistance(newLat, newLng, dstLat, dstLng);
                    if (dist <= ARRIVAL_THRESHOLD_M) {
                        updatedTask = { ...currentTask, status: 'Completed', progress: 100, completedAt: Date.now() };
                    }
                }
            }

            // ═══ COLLISION DETECTION (atomic — merged into location update) ═══
            // Build the updated robot with new location and phase changes
            const updatedThisRobot = {
                ...existingRobot,
                location: {
                    lat: newLat,
                    lng: newLng,
                    z: payload.z ?? payload.altitude ?? existingRobot.location?.z
                },
                task: updatedTask,
                heading: payload.heading ?? payload.orientation ?? existingRobot.heading,
                lastUpdate: Date.now()
            };

            // Check this robot against all other robots on the same device
            const collidingPairs = [];
            if (newLat != null && newLng != null) {
                Object.entries(deviceRobots).forEach(([otherId, otherRobot]) => {
                    if (otherId === robotId) return;
                    if (!otherRobot?.location?.lat || !otherRobot?.location?.lng) return;
                    const dist = haversineDistance(newLat, newLng, otherRobot.location.lat, otherRobot.location.lng);
                    if (dist <= COLLISION_THRESHOLD_M) {
                        collidingPairs.push({ otherId, distance: dist.toFixed(2) });
                    }
                });
            }

            // Start with a copy of all device robots
            const updatedDeviceRobots = { ...deviceRobots };

            if (collidingPairs.length > 0) {
                // ── COLLISION DETECTED ──
                // Only block the robot that moved into the collision zone.
                // The other robot(s) keep operating — we just alert about them.
                const nearbyIds = collidingPairs.map(p => p.otherId);

                // Block THIS robot (the one that moved too close)
                updatedThisRobot.status = {
                    ...existingRobot.status,
                    state: 'BLOCKED',
                    blockedAt: existingRobot.status?.state === 'BLOCKED' ? existingRobot.status.blockedAt : Date.now(),
                    blockedBy: nearbyIds
                };
                updatedThisRobot.task = updatedTask
                    ? { ...updatedTask, paused: true, pausedReason: 'collision' }
                    : null;

                // Do NOT modify the other robots — they continue undisturbed

                // Throttled side-effects (alerts + IoT) — max once per 30s per robot pair
                const pairKey = [robotId, ...nearbyIds].sort().join('|');
                const now = Date.now();
                const lastAlertTime = collisionAlertThrottle.current[pairKey] || 0;
                if (now - lastAlertTime > 30000) {
                    collisionAlertThrottle.current[pairKey] = now;
                    const pairNames = nearbyIds.join(', ');
                    setTimeout(() => {
                        addAlert({
                            type: 'critical', deviceId, robotId,
                            message: `🚨 COLLISION RISK: ${robotId} is within ${collidingPairs[0].distance}m of ${pairNames}. ${robotId} blocked until path is clear.`,
                            timestamp: Date.now()
                        });
                        (async () => {
                            try {
                                await updateStateDetails(deviceId, 'fleetMS/collision', {
                                    type: 'collision_detected',
                                    blocked_robot: robotId,
                                    nearby_robots: nearbyIds,
                                    distance: collidingPairs[0].distance,
                                    location: { lat: newLat, lng: newLng },
                                    timestamp: new Date().toISOString(),
                                    action: 'robot_blocked'
                                });
                            } catch (err) {
                                console.error('[Device] Failed to send collision state:', err);
                            }
                        })();
                    }, 0);
                }

            } else if (existingRobot.status?.state === 'BLOCKED') {
                // ── CHECK COLLISION RESOLUTION ──
                const blockedBy = existingRobot.status?.blockedBy || [];
                const stillColliding = blockedBy.some(otherId => {
                    const other = deviceRobots[otherId];
                    if (!other?.location?.lat || !other?.location?.lng) return false;
                    return haversineDistance(newLat, newLng, other.location.lat, other.location.lng) <= COLLISION_THRESHOLD_M;
                });

                if (!stillColliding) {
                    // Unblock this robot — it has moved away from the collision zone
                    const resumedState = updatedTask?.phase && updatedTask.phase !== TASK_PHASES.COMPLETED ? 'ACTIVE' : 'READY';
                    updatedThisRobot.status = {
                        ...existingRobot.status,
                        state: resumedState,
                        blockedAt: undefined,
                        blockedBy: undefined
                    };
                    updatedThisRobot.task = updatedTask
                        ? { ...updatedTask, paused: false, pausedReason: null }
                        : null;

                    setTimeout(() => {
                        addAlert({
                            type: 'info', deviceId, robotId,
                            message: `✅ Collision resolved: ${robotId} path cleared. Resuming operations.`,
                            timestamp: Date.now()
                        });
                        (async () => {
                            try {
                                await updateStateDetails(deviceId, 'fleetMS/collision', {
                                    type: 'collision_resolved',
                                    robot: robotId,
                                    timestamp: new Date().toISOString(),
                                    action: 'robot_resumed'
                                });
                            } catch (err) {
                                console.error('[Device] Failed to send collision resolution:', err);
                            }
                        })();
                    }, 0);
                } else {
                    // Still colliding — maintain BLOCKED state
                    updatedThisRobot.status = existingRobot.status;
                    updatedThisRobot.task = updatedTask
                        ? { ...updatedTask, paused: true, pausedReason: 'collision' }
                        : null;
                }

            } else {
                // ── NORMAL STATUS ASSIGNMENT (no collision) ──
                updatedThisRobot.status = updatedTask?.phase === TASK_PHASES.COMPLETED
                    ? { ...existingRobot.status, state: 'READY' }
                    : updatedTask?.phase && updatedTask.phase !== TASK_PHASES.ASSIGNED
                        ? { ...existingRobot.status, state: 'ACTIVE' }
                        : (payload.status ? { ...existingRobot.status, ...payload.status } : existingRobot.status);
            }

            updatedDeviceRobots[robotId] = updatedThisRobot;

            return {
                ...prev,
                [deviceId]: updatedDeviceRobots
            };
        });

        // Append location to robot history (keep simple lat,lng object)
        try { addRobotHistory(deviceId, robotId, 'location', { lat: payload.lat ?? payload.latitude ?? payload.location?.lat, lng: payload.lng ?? payload.longitude ?? payload.location?.lng }); } catch (e) { /* ignore */ }
    }, [addAlert, addRobotHistory, notifyTaskUpdate]);

    // Handle robot temperature updates
    // Handle robot temperature updates
    const handleRobotTempUpdate = useCallback((deviceId, robotId, payload) => {
        // Unwrap payload if nested (though routeStreamData does this, sometimes structure varies)
        const data = payload.payload || payload;
        const temp = data.temperature ?? data.temp;
        setRobots(prev => {
            const deviceRobots = prev[deviceId] || {};
            const existingRobot = deviceRobots[robotId] || {
                id: robotId,
                location: { lat: null, lng: null, z: 0 },
                heading: 0,
                status: { state: 'READY', battery: 100 },
                environment: { temp: null, humidity: null },
                task: null
            };

            const updatedRobot = {
                ...existingRobot,
                environment: {
                    ...existingRobot.environment,
                    temp: temp ?? existingRobot.environment?.temp,
                    humidity: data.humidity ?? existingRobot.environment?.humidity
                },
                lastUpdate: Date.now()
            };

            // attach computed severity for UI coloring
            const sev = computeRobotSeverity(updatedRobot);
            updatedRobot.severity = sev;

            // return new state
            return {
                ...prev,
                [deviceId]: {
                    ...deviceRobots,
                    [robotId]: updatedRobot
                }
            };
        });

        // Append to robot history for analysis
        try { addRobotHistory(deviceId, robotId, 'temp', temp); } catch (e) { /* ignore */ }

        // Check for robot temperature threshold
        if (temp != null && temp > 40) {
            addAlert({
                type: 'warning',
                deviceId,
                robotId,
                message: `Robot ${robotId} overheating: ${temp}°C`,
                timestamp: Date.now()
            });
        }
    }, [addAlert, computeRobotSeverity, addRobotHistory]);



    // Handle robot status updates
    const handleRobotStatusUpdate = useCallback((deviceId, robotId, payload) => {
        // Ensure robot is registered
        setRobots(prev => {
            if (!prev[deviceId]?.[robotId]) {
                return {
                    ...prev,
                    [deviceId]: {
                        ...prev[deviceId],
                        [robotId]: {
                            id: robotId,
                            location: { lat: 0, lng: 0, z: 0 },
                            heading: 0,
                            environment: { temp: null, humidity: null },
                            status: { battery: null, load: null, state: 'UNKNOWN' },
                            task: null,
                            lastUpdate: Date.now()
                        }
                    }
                };
            }
            return prev;
        });

        setRobots(prev => ({
            ...prev,
            [deviceId]: {
                ...prev[deviceId],
                [robotId]: {
                    ...prev[deviceId]?.[robotId],
                    status: {
                        ...prev[deviceId]?.[robotId]?.status,
                        load: payload.load ?? prev[deviceId]?.[robotId]?.status?.load,
                        state: payload.state ?? payload.status ?? prev[deviceId]?.[robotId]?.status?.state
                    },
                    lastUpdate: Date.now()
                }
            }
        }));

        // Check for obstacle detection
        if (payload.obstacle_detected || payload.obstacle) {
            addAlert({
                type: 'critical',
                deviceId,
                robotId,
                message: `Robot ${robotId} obstacle detected!`,
                timestamp: Date.now()
            });
        }

        // compute severity and append status to robot history
        try {
            setRobots(prev => {
                const deviceRobots = prev[deviceId] || {};
                const r = deviceRobots[robotId] || {};
                const updated = {
                    ...r,
                    status: {
                        ...r.status,
                        load: payload.load ?? r.status?.load,
                        state: payload.state ?? payload.status ?? r.status?.state
                    },
                    lastUpdate: Date.now()
                };
                updated.severity = computeRobotSeverity(updated);

                // also push a small status history entry
                try { addRobotHistory(deviceId, robotId, 'status', updated.status.state); } catch (e) { /* ignore */ }

                return { ...prev, [deviceId]: { ...deviceRobots, [robotId]: updated } };
            });
        } catch (e) { /* ignore */ }
    }, [addAlert, computeRobotSeverity, addRobotHistory]);

    // Handle robot battery updates
    const handleRobotBatteryUpdate = useCallback((deviceId, robotId, payload) => {
        // Ensure robot is registered
        setRobots(prev => {
            if (!prev[deviceId]?.[robotId]) {
                return {
                    ...prev,
                    [deviceId]: {
                        ...prev[deviceId],
                        [robotId]: {
                            id: robotId,
                            location: { lat: 0, lng: 0, z: 0 },
                            heading: 0,
                            environment: { temp: null, humidity: null },
                            status: { battery: null, load: null, state: 'UNKNOWN' },
                            task: null,
                            lastUpdate: Date.now()
                        }
                    }
                };
            }
            return prev;
        });

        const battery = payload.battery ?? payload.level ?? payload.percentage;

        setRobots(prev => {
            const deviceRobots = prev[deviceId] || {};
            const existingRobot = deviceRobots[robotId] || {
                id: robotId,
                location: { lat: 0, lng: 0, z: 0 },
                heading: 0,
                environment: { temp: null, humidity: null },
                status: { battery: null, load: null, state: 'UNKNOWN' },
                task: null
            };

            const updatedRobot = {
                ...existingRobot,
                status: {
                    ...existingRobot.status,
                    battery: battery ?? existingRobot.status?.battery
                },
                lastUpdate: Date.now()
            };

            // attach computed severity
            updatedRobot.severity = computeRobotSeverity(updatedRobot);

            return {
                ...prev,
                [deviceId]: {
                    ...deviceRobots,
                    [robotId]: updatedRobot
                }
            };
        });

        // Append to robot history for analysis
        try { addRobotHistory(deviceId, robotId, 'battery', battery); } catch (e) { /* ignore */ }

        // Get thresholds from localStorage
        const thresholds = getThresholds();

        // Check for low battery
        if (battery != null) {
            if (battery <= thresholds.battery.critical) {
                addAlert({
                    type: 'critical',
                    deviceId,
                    robotId,
                    message: `CRITICAL: Robot ${robotId} battery at ${battery}%`,
                    timestamp: Date.now()
                });
            } else if (battery <= thresholds.battery.low) {
                addAlert({
                    type: 'warning',
                    deviceId,
                    robotId,
                    message: `Robot ${robotId} low battery: ${battery}%`,
                    timestamp: Date.now()
                });
            }
        }
    }, [addAlert]);

    // Handle robot task updates (both stream and state)
    const handleRobotTaskUpdate = useCallback((deviceId, robotId, payload) => {
        // ── Record task to persistent local history ──────────────────────
        if (payload && typeof payload === 'object' && payload.status !== 'cleared') {
            const taskId = payload.task_id || payload.taskId || payload.id;
            if (taskId) {
                const history = taskHistoryRef.current;
                if (!history[deviceId]) history[deviceId] = {};
                if (!history[deviceId][robotId]) history[deviceId][robotId] = [];

                const robotTasks = history[deviceId][robotId];
                const existingIdx = robotTasks.findIndex(t => (t.task_id || t.taskId) === taskId);

                const entry = {
                    ...payload,
                    robotId,
                    task_type: payload.task_type || 'Deliver',
                    timestamp: payload.timestamp || payload.assignedAt || Date.now(),
                    recordedAt: existingIdx >= 0 ? robotTasks[existingIdx].recordedAt : Date.now(),
                    lastUpdated: Date.now(),
                };

                if (existingIdx >= 0) {
                    // Merge — keep original recordedAt, update everything else
                    robotTasks[existingIdx] = { ...robotTasks[existingIdx], ...entry };
                } else {
                    robotTasks.push(entry);
                }

                // Trim entries older than 7 days to prevent unbounded growth
                const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
                history[deviceId][robotId] = robotTasks.filter(
                    t => (t.lastUpdated || t.recordedAt || 0) > cutoff
                );

                try { localStorage.setItem('fabrix_task_history', JSON.stringify(history)); } catch { /* ignore quota errors */ }
            }
        }

        // ── Update live robot state ──────────────────────────────────────
        // Ensure robot is registered
        setRobots(prev => {
            if (!prev[deviceId]?.[robotId]) return prev;

            const currentRobot = prev[deviceId][robotId];
            const currentQueue = currentRobot.taskQueue || [];

            // Normalize task data — always treat as Deliver
            let taskData = payload;
            if (typeof payload === 'string') {
                taskData = { task_type: 'Deliver' };
            } else if (typeof payload === 'object') {
                taskData = {
                    ...payload,
                    task_type: 'Deliver',
                    task_id: payload.task_id || payload.taskId || null,
                };
            }

            // If already completed/cleared, don't overwrite with new assignment data
            if (taskData.status === 'cleared') {
                // Try to dequeue next task
                if (currentQueue.length > 0) {
                    const [nextTask, ...remaining] = currentQueue;
                    // Schedule the next task to start after a brief delay
                    setTimeout(() => {
                        handleRobotTaskUpdate(deviceId, robotId, { ...nextTask, status: 'Assigned' });
                    }, 500);
                    return {
                        ...prev,
                        [deviceId]: {
                            ...prev[deviceId],
                            [robotId]: { ...currentRobot, task: null, taskQueue: remaining, status: { ...currentRobot.status, state: 'READY' }, lastUpdate: Date.now() }
                        }
                    };
                }
                return {
                    ...prev,
                    [deviceId]: {
                        ...prev[deviceId],
                        [robotId]: { ...currentRobot, task: null, taskQueue: [], status: { ...currentRobot.status, state: 'READY' }, lastUpdate: Date.now() }
                    }
                };
            }

            // Preserve existing phase data if this is an incremental update (same taskId)
            const existingTask = currentRobot.task;
            const incomingTaskId = taskData.task_id || taskData.taskId;
            const existingTaskId = existingTask?.task_id || existingTask?.taskId;
            const isSameTask = existingTask && incomingTaskId && incomingTaskId === existingTaskId;

            // ── Queue logic: if robot is busy with a different task, queue the new one ──
            if (existingTask && !isSameTask && incomingTaskId) {
                const existingPhase = existingTask.phase;
                const isExistingActive = existingPhase && existingPhase !== TASK_PHASES.COMPLETED;
                if (isExistingActive) {
                    // Don't queue duplicates
                    const alreadyQueued = currentQueue.some(t => (t.task_id || t.taskId) === incomingTaskId);
                    if (!alreadyQueued) {
                        const updatedQueue = [...currentQueue, { ...taskData, status: 'Assigned', assignedAt: Date.now() }];
                        return {
                            ...prev,
                            [deviceId]: {
                                ...prev[deviceId],
                                [robotId]: { ...currentRobot, taskQueue: updatedQueue, lastUpdate: Date.now() }
                            }
                        };
                    }
                    return prev;
                }
            }

            // If the incoming payload already has a phase (e.g. from backend), respect it
            const incomingPhase = taskData.phase;
            const isCompletedIncoming = taskData.status === 'Completed' || taskData.status === 'completed';

            let phase;
            if (isCompletedIncoming) {
                phase = TASK_PHASES.COMPLETED;
            } else if (incomingPhase && Object.values(TASK_PHASES).includes(incomingPhase)) {
                phase = incomingPhase;
            } else if (isSameTask && existingTask.phase) {
                phase = existingTask.phase;
            } else {
                // New task always starts at ASSIGNED (0%) — auto-advance timer moves it forward
                phase = TASK_PHASES.ASSIGNED;
            }

            // Capture robot's current position at assignment time (for progress calculation)
            // Only use if it looks like real GPS (not null/0 defaults)
            const rawLat = currentRobot.location?.lat;
            const rawLng = currentRobot.location?.lng;
            const posIsValid = rawLat != null && rawLng != null && (Math.abs(rawLat) > 1 || Math.abs(rawLng) > 1);
            const assignedAtLat = isSameTask ? (existingTask.assignedAtLat ?? (posIsValid ? rawLat : null)) : (posIsValid ? rawLat : null);
            const assignedAtLng = isSameTask ? (existingTask.assignedAtLng ?? (posIsValid ? rawLng : null)) : (posIsValid ? rawLng : null);

            const mergedTask = {
                ...(isSameTask ? existingTask : {}),
                ...taskData,
                phase,
                assignedAtLat,
                assignedAtLng,
                assignedAt: isSameTask ? (existingTask.assignedAt ?? taskData.assignedAt ?? new Date().toISOString()) : (taskData.assignedAt ?? new Date().toISOString()),
                // Preserve timestamps from existing task
                sourceArrivedAt: isSameTask ? existingTask.sourceArrivedAt : null,
                pickedUpAt: isSameTask ? existingTask.pickedUpAt : null,
                destinationArrivedAt: isSameTask ? existingTask.destinationArrivedAt : null,
                deliveredAt: isSameTask ? existingTask.deliveredAt : null,
                completedAt: isCompletedIncoming ? (taskData.completedAt || Date.now()) : (isSameTask ? existingTask.completedAt : null),
            };

            // Compute initial progress
            mergedTask.progress = computePhaseProgress(mergedTask, currentRobot.location?.lat, currentRobot.location?.lng);

            // If newly assigned, register with mock service and auto-advance after a tick
            if (phase === TASK_PHASES.ASSIGNED) {
                // Register task with mock service so robot moves toward target
                registerActiveTask(deviceId, robotId, mergedTask);

                setTimeout(() => {
                    setRobots(p => {
                        const r = p[deviceId]?.[robotId];
                        if (!r?.task || r.task.phase !== TASK_PHASES.ASSIGNED) return p;

                        // Determine if source coords are available (explicit or from room name)
                        const srcRoom = r.task['initiate location'] || r.task.source_name;
                        const srcResolved = srcRoom ? resolveRoom(srcRoom) : null;
                        const hasSrc = (r.task.source_lat ?? r.task.src_lat ?? srcResolved?.room.center?.lat) != null;

                        const nextPhase = hasSrc ? TASK_PHASES.EN_ROUTE_TO_SOURCE : TASK_PHASES.EN_ROUTE_TO_DESTINATION;
                        // Update mock service phase so robot moves in the right direction
                        updateActiveTaskPhase(deviceId, robotId, nextPhase);
                        // Always start at the bottom of the phase band so newly-assigned tasks
                        // visually begin from 0% regardless of the robot's current position.
                        // Location ticks will smoothly advance the bar from here.
                        const progress = nextPhase === TASK_PHASES.EN_ROUTE_TO_SOURCE ? 2 : 51;
                        return {
                            ...p,
                            [deviceId]: { ...p[deviceId], [robotId]: { ...r, task: { ...r.task, phase: nextPhase, progress }, lastUpdate: Date.now() } }
                        };
                    });
                }, 2000);
            }

            return {
                ...prev,
                [deviceId]: {
                    ...prev[deviceId],
                    [robotId]: {
                        ...currentRobot,
                        task: mergedTask,
                        taskQueue: currentQueue,
                        status: { ...currentRobot.status, state: phase === TASK_PHASES.COMPLETED ? 'READY' : 'ACTIVE' },
                        lastUpdate: Date.now()
                    }
                }
            };
        });

        // ── Auto-dequeue: if task just completed, start next queued task after brief delay ──
        if (payload && typeof payload === 'object' &&
            (payload.status === 'Completed' || payload.status === 'completed' || payload.phase === TASK_PHASES.COMPLETED)) {
            // Clear active task from mock service immediately
            clearActiveTask(deviceId, robotId);
            setTimeout(() => {
                setRobots(p => {
                    const r = p[deviceId]?.[robotId];
                    if (!r || !r.taskQueue?.length) return p;
                    // Only dequeue if current task is completed or null
                    const currentPhase = r.task?.phase;
                    if (r.task && currentPhase !== TASK_PHASES.COMPLETED) return p;

                    const [nextTask, ...remaining] = r.taskQueue;
                    // Schedule the next queued task — strip stale execution state so it starts fresh at 0%
                    setTimeout(() => {
                        const { phase: _p, progress: _pr, sourceArrivedAt: _sa, pickedUpAt: _pu,
                            destinationArrivedAt: _da, deliveredAt: _de, completedAt: _ca, ...freshTask } = nextTask;
                        handleRobotTaskUpdate(deviceId, robotId, { ...freshTask, status: 'Assigned', assignedAt: Date.now() });
                    }, 100);
                    return {
                        ...p,
                        [deviceId]: { ...p[deviceId], [robotId]: { ...r, taskQueue: remaining, lastUpdate: Date.now() } }
                    };
                });
            }, 2000); // 2s delay before picking up next task
        }
    }, []);

    // Handle robot online/offline status updates
    // Payload format: {"robot-status": "online" | "offline", "robotId": "R-001"}
    const handleRobotOnlineStatus = useCallback((deviceId, robotId, status) => {
        setRobots(prev => {
            // Find the robot - might be stored with different ID format
            const deviceRobots = prev[deviceId] || {};
            const matchingRobotId = Object.keys(deviceRobots).find(id =>
                id === robotId ||
                id.includes(robotId) ||
                robotId.includes(id)
            ) || robotId;

            return {
                ...prev,
                [deviceId]: {
                    ...prev[deviceId],
                    [matchingRobotId]: {
                        ...prev[deviceId]?.[matchingRobotId],
                        id: matchingRobotId,
                        'robot-status': status,
                        robotStatus: status,
                        lastUpdate: Date.now()
                    }
                }
            };
        });
    }, []);

    // Clear alert by ID
    const clearAlert = useCallback((alertId) => {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
    }, []);

    // Clear all alerts
    const clearAllAlerts = useCallback(() => {
        setAlerts([]);
    }, []);

    // Mark a specific alert as read
    const markAlertRead = useCallback((alertId) => {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
    }, []);

    // Mark all alerts as read
    const markAllAlertsRead = useCallback(() => {
        setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    }, []);

    // Manage WebSocket Connection & Routing
    useEffect(() => {
        if (!isAuthenticated) return;

        const deviceId = selectedDeviceId;

        // Data Routing Logic
        const routeStreamData = (payload) => {
            let effectivePayload = payload;
            let topicPath = payload.topicSuffix || payload.topic || '';

            if (payload.payload && typeof payload.payload === 'object') {
                effectivePayload = payload.payload;
            }

            // 1. Device Environment Updates (Strict Topic Check)
            if (topicPath === 'fleetMS/temperature' ||
                topicPath === 'fleetMS/humidity' ||
                topicPath === 'fleetMS/pressure' ||
                topicPath === 'fleetMS/environment' ||
                topicPath === 'fleetMS/env') {
                // Accept full environment payloads (temperature, humidity, pressure)
                handleTemperatureUpdate(deviceId, effectivePayload);
                return;
            }

            // 2. Robot Updates (Flexible Pattern Matching)
            // Pattern: fleetMS/robots/<robotId>[/<metric>]
            // Matches "robots/R-001" AND "robots/R-001/temperature"
            const robotMatch = topicPath.match(/robots\/([^/]+)(?:\/(.+))?$/);

            if (robotMatch) {
                const robotId = robotMatch[1];
                const metricFromTopic = robotMatch[2]; // undefined if no suffix

                // Helper to dispatch based on metric or payload keys
                const dispatchRobotUpdate = (metric, data) => {
                    switch (metric) {
                        case 'temperature':
                        case 'temp':
                            handleRobotTempUpdate(deviceId, robotId, data);
                            break;
                        case 'battery':
                            handleRobotBatteryUpdate(deviceId, robotId, data);
                            break;
                        case 'location':
                            handleRobotLocationUpdate(deviceId, robotId, data);
                            break;
                        case 'status':
                        case 'state':
                            handleRobotStatusUpdate(deviceId, robotId, data);
                            break;
                        case 'task':
                            handleRobotTaskUpdate(deviceId, robotId, data);
                            break;
                        default:
                            // Unknown robot metric — skip silently
                            break;
                    }
                };

                // Case A: Metric is in validity topic (e.g. .../temperature)
                if (metricFromTopic) {
                    dispatchRobotUpdate(metricFromTopic, effectivePayload);
                    return;
                }

                // Case B: No metric in topic, infer from payload keys
                // Process status first so UI shows connectivity/state immediately,
                // then store sensor values into history and UI.
                if (effectivePayload.status !== undefined || effectivePayload.state !== undefined) {
                    dispatchRobotUpdate('status', effectivePayload);
                }
                if (effectivePayload.temperature !== undefined || effectivePayload.temp !== undefined) {
                    dispatchRobotUpdate('temperature', effectivePayload);
                }
                if (effectivePayload.battery !== undefined || effectivePayload.level !== undefined) {
                    dispatchRobotUpdate('battery', effectivePayload);
                }
                if (effectivePayload.lat !== undefined || effectivePayload.lng !== undefined || effectivePayload.location !== undefined) {
                    dispatchRobotUpdate('location', effectivePayload);
                }
                if (effectivePayload.task !== undefined) {
                    dispatchRobotUpdate('task', effectivePayload);
                }
                return;
            }

            // 3. Fallback / legacy routing (if no specific topic matches, try to infer from payload)
            // This ensures robust handling if topic is missing or different
            if (effectivePayload.robots !== undefined || effectivePayload.robotId !== undefined) {
                // Discovery or direct payload update
                if (effectivePayload.robots) {
                    handleRobotsDiscovery(deviceId, effectivePayload);
                } else if (effectivePayload.robotId) {
                    // Routing based on payload content + robotId presence
                    const rId = effectivePayload.robotId;
                    if (effectivePayload.lat !== undefined || effectivePayload.location !== undefined) {
                        handleRobotLocationUpdate(deviceId, rId, effectivePayload.location || effectivePayload);
                    }
                    if (effectivePayload.temperature !== undefined && !effectivePayload.ambient_temp) {
                        handleRobotTempUpdate(deviceId, rId, effectivePayload);
                    }
                    if (effectivePayload.status !== undefined || effectivePayload.state !== undefined) {
                        handleRobotStatusUpdate(deviceId, rId, effectivePayload);
                    }
                    if (effectivePayload.battery !== undefined || effectivePayload.level !== undefined) {
                        handleRobotBatteryUpdate(deviceId, rId, effectivePayload);
                    }
                    if (effectivePayload.task !== undefined || effectivePayload.tasks !== undefined) {
                        handleRobotTaskUpdate(deviceId, rId, effectivePayload);
                    }
                }
            } else if (!topicPath) {
                // Only attempt to guess device env data if NO topic path was present to avoid double handling
                if (effectivePayload.ambient_temp !== undefined || effectivePayload.temperature !== undefined) {
                    handleTemperatureUpdate(deviceId, effectivePayload);
                }
            }

            // Always check for device status / alerts in any payload
            handleDeviceStatusUpdate(deviceId, effectivePayload);
        };

        const routeStateData = (payload) => {
            if (payload.ac_power !== undefined || payload.ac !== undefined) {
                handleACUpdate(deviceId, payload);
            }
            if (payload.air_purifier !== undefined || payload.airPurifier !== undefined) {
                handleAirPurifierUpdate(deviceId, payload);
            }
            if (payload.robotId && payload.task !== undefined) {
                handleRobotTaskUpdate(deviceId, payload.robotId, payload);
            }
            handleDeviceStatusUpdate(deviceId, payload);
        };

        const client = connectWebSocket(
            deviceId,
            routeStreamData,
            routeStateData,
            () => {
                setIsConnected(true);
                setConnectionError(null);
            },
            () => {
                setIsConnected(false);
            }
        );

        return () => {

            client.deactivate();
            setIsConnected(false);
        };
    }, [isAuthenticated, selectedDeviceId, handleTemperatureUpdate, handleACUpdate, handleDeviceStatusUpdate, handleAirPurifierUpdate, handleRobotsDiscovery, handleRobotLocationUpdate, handleRobotTempUpdate, handleRobotStatusUpdate, handleRobotBatteryUpdate, handleRobotTaskUpdate, handleRobotOnlineStatus]);

    // Poll robot topics every 10s to ensure status updates from topic `fleetMS/robots/<robotId>` are applied
    // IMPORTANT: Only apply data that is NEWER than the robot's last update to avoid overwriting
    // live WebSocket/MQTTX updates with stale poll results.
    useEffect(() => {
        if (!isAuthenticated || !selectedDeviceId) return;

        let cancelled = false;

        const pollOnce = async () => {
            try {
                // Read robots via ref so we don't need 'robots' in the dep array
                const deviceRobots = (robotsRef.current ?? robots)[selectedDeviceId] || {};
                const robotIds = Object.keys(deviceRobots);
                if (robotIds.length === 0) return;

                // small time window (last 2 minutes) to capture recent messages
                const { startTime, endTime } = getTimeRange(0.0333); // ~2 minutes

                await Promise.all(robotIds.map(async (robotId) => {
                    if (cancelled) return;
                    try {
                        const res = await getTopicStreamData(selectedDeviceId, `fleetMS/robots/${robotId}`, startTime, endTime, '0', '5', { silent: true });
                        if (res?.status === 'Success' && Array.isArray(res.data) && res.data.length > 0) {
                            // Use most recent message
                            const latest = res.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

                            // Skip if this message is older than the robot's last live update
                            const messageTime = new Date(latest.timestamp).getTime();
                            const robotLastUpdate = deviceRobots[robotId]?.lastUpdate || 0;
                            if (messageTime <= robotLastUpdate) return; // stale data — skip

                            let payload = {};
                            try { payload = JSON.parse(latest.payload || '{}'); } catch (e) { payload = latest.payload || {}; }

                            // Dispatch updates based on payload keys — but NOT location
                            // Location is handled exclusively via live WebSocket/stream to
                            // prevent position flickering from stale poll results.
                            if (payload.temperature !== undefined || payload.temp !== undefined) {
                                handleRobotTempUpdate(selectedDeviceId, robotId, payload);
                            }
                            if (payload.battery !== undefined || payload.level !== undefined) {
                                handleRobotBatteryUpdate(selectedDeviceId, robotId, payload);
                            }
                            if (payload.status !== undefined || payload.state !== undefined || payload.obstacle !== undefined) {
                                handleRobotStatusUpdate(selectedDeviceId, robotId, payload);
                            }
                            if (payload.task !== undefined || payload.tasks !== undefined) {
                                handleRobotTaskUpdate(selectedDeviceId, robotId, payload.task ?? payload);
                            }
                        }
                    } catch (e) {
                        // ignore per-robot errors
                    }
                }));
            } catch (e) {
                // poll error
            }
        };

        // start immediate then interval
        pollOnce();
        const id = setInterval(pollOnce, 10000);
        return () => { cancelled = true; clearInterval(id); };
        // Note: 'robots' is intentionally omitted — we read it via robotsRef to prevent the effect
        // from restarting every 3 s on each WebSocket robot tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, selectedDeviceId, handleRobotTempUpdate, handleRobotBatteryUpdate, handleRobotStatusUpdate, handleRobotTaskUpdate]);

    // ===== TIMEOUT DETECTION =====
    // Periodically check if any robot with an active task hasn't received a location update for 5 min → mark FAILED
    const TASK_TIMEOUT_MS = 5 * 60 * 1000;
    useEffect(() => {
        if (!selectedDeviceId) return;
        const interval = setInterval(() => {
            setRobots(prev => {
                const deviceRobots = prev[selectedDeviceId];
                if (!deviceRobots) return prev;
                let changed = false;
                const updated = { ...deviceRobots };
                Object.entries(deviceRobots).forEach(([rId, robot]) => {
                    const task = robot?.task;
                    if (!task?.phase) return;
                    if (task.phase === TASK_PHASES.COMPLETED || task.phase === TASK_PHASES.FAILED) return;
                    const lastUpdate = robot.lastUpdate || 0;
                    if (Date.now() - lastUpdate > TASK_TIMEOUT_MS) {
                        changed = true;
                        updated[rId] = {
                            ...robot,
                            task: { ...task, phase: TASK_PHASES.FAILED, failedAt: Date.now(), previousPhase: task.phase }
                        };
                        addAlert({
                            type: 'warning', deviceId: selectedDeviceId, robotId: rId,
                            message: `⚠️ ${rId} delivery timed out during ${PHASE_LABELS[task.phase] || task.phase} — no updates for 5 min`,
                            timestamp: Date.now()
                        });
                    }
                });
                if (!changed) return prev;
                return { ...prev, [selectedDeviceId]: updated };
            });
        }, 60000);
        return () => clearInterval(interval);
    }, [selectedDeviceId, addAlert]);

    // Note: Robot subscriptions removed - all data comes through main STREAM/STATE topics

    // Robots are discovered via WebSocket - no mock data

    // Refresh device state from API
    const refreshDeviceState = useCallback(async () => {
        if (!selectedDeviceId) return;



        try {
            const response = await getStateDetails(selectedDeviceId);

            if (response.status === 'Success' && response.data) {
                setDeviceData(prev => ({
                    ...prev,
                    [selectedDeviceId]: {
                        ...prev[selectedDeviceId],
                        state: {
                            ...prev[selectedDeviceId]?.state,
                            ac_power: response.data.ac?.status ?? response.data.ac?.payload?.status ?? prev[selectedDeviceId]?.state?.ac_power,
                            air_purifier: response.data.airPurifier?.status ?? response.data.airPurifier?.payload?.status ?? prev[selectedDeviceId]?.state?.air_purifier,
                            status: response.data.status?.status ?? response.data.status?.payload?.status ?? prev[selectedDeviceId]?.state?.status,
                            gateway_health: response.data.status?.gateway_health ?? prev[selectedDeviceId]?.state?.gateway_health
                        },
                        lastUpdate: Date.now()
                    }
                }));

            }
        } catch (error) {
            console.error('[Device] Failed to refresh state:', error);
        }
    }, [selectedDeviceId]);

    // Keep ref up-to-date so WebSocket handlers can call it
    refreshDeviceStateRef.current = refreshDeviceState;

    // Optimistic update helper
    const updateRobotTaskLocal = useCallback((robotId, taskPayload) => {
        handleRobotTaskUpdate(selectedDeviceId, robotId, taskPayload);
    }, [selectedDeviceId, handleRobotTaskUpdate]);

    // History getters for Analysis page
    const getEnvHistory = useCallback((deviceId) => envHistory[deviceId] || [], [envHistory]);
    const getRobotHistory = useCallback((deviceId, robotId) => (robotHistory[deviceId] && robotHistory[deviceId][robotId]) || [], [robotHistory]);

    // Reset a specific robot to a free/idle state (clears task, sets state to IDLE).
    // Called by the user pressing the reset button on a robot card after task completion.
    const resetRobot = useCallback((robotId) => {
        if (!selectedDeviceId || !robotId) return;
        clearActiveTask(selectedDeviceId, robotId);
        setRobots(prev => {
            const existing = prev[selectedDeviceId]?.[robotId];
            if (!existing) return prev;
            return {
                ...prev,
                [selectedDeviceId]: {
                    ...prev[selectedDeviceId],
                    [robotId]: {
                        ...existing,
                        task: null,
                        taskQueue: [],
                        status: { ...existing.status, state: 'IDLE', load: null },
                        lastUpdate: Date.now(),
                    },
                },
            };
        });
    }, [selectedDeviceId]);

    // Fetch robot tasks from API using /user/get-state-details/device/topic
    // This fetches task data for all robots from the topic fleetMS/robots/<robotId>/task
    const fetchRobotTasks = useCallback(async () => {
        if (!selectedDeviceId) return {};



        const deviceRobots = Object.keys(robots[selectedDeviceId] || {});
        const registryRobots = getRobotsForDevice(selectedDeviceId);

        // Combine robots from state and registry
        const allRobotIds = [...new Set([...deviceRobots, ...registryRobots.map(r => r.id)])];

        if (allRobotIds.length === 0) {

            return {};
        }

        const taskMap = {};

        await Promise.all(allRobotIds.map(async (robotId) => {
            try {
                // Fetch task state from topic: fleetMS/robots/<robotId>/task
                const response = await getTopicStateDetails(selectedDeviceId, `fleetMS/robots/${robotId}/task`);

                if (response?.status === 'Success' && response.data) {
                    let taskData = response.data;

                    // Unwrap nested payload if present
                    if (taskData.payload) {
                        taskData = typeof taskData.payload === 'string'
                            ? JSON.parse(taskData.payload)
                            : taskData.payload;
                    }

                    taskMap[robotId] = {
                        robotId,
                        ...taskData,
                        fetchedAt: Date.now()
                    };



                    // Also update the robot's task state in context
                    handleRobotTaskUpdate(selectedDeviceId, robotId, taskData);
                }
            } catch (err) {
                // Robot might not have a task topic - that's okay

            }
        }));

        setFetchedRobotTasks(prev => ({
            ...prev,
            [selectedDeviceId]: taskMap
        }));


        return taskMap;
    }, [selectedDeviceId, robots, handleRobotTaskUpdate]);

    // Automatically fetch robot tasks when device selection changes (ensures tasks load on refresh)
    useEffect(() => {
        if (!selectedDeviceId || !isAuthenticated) return;

        // Small delay to ensure WebSocket is connected and robot registry is populated
        const timeoutId = setTimeout(() => {

            // Use an IIFE to call the async function
            (async () => {
                try {
                    const deviceRobots = Object.keys(robots[selectedDeviceId] || {});
                    const registryRobots = getRobotsForDevice(selectedDeviceId);
                    const allRobotIds = [...new Set([...deviceRobots, ...registryRobots.map(r => r.id)])];

                    if (allRobotIds.length === 0) {

                        return;
                    }

                    const taskMap = {};

                    await Promise.all(allRobotIds.map(async (robotId) => {
                        try {
                            const response = await getTopicStateDetails(selectedDeviceId, `fleetMS/robots/${robotId}/task`);

                            if (response?.status === 'Success' && response.data) {
                                let taskData = response.data;

                                if (taskData.payload) {
                                    taskData = typeof taskData.payload === 'string'
                                        ? JSON.parse(taskData.payload)
                                        : taskData.payload;
                                }

                                taskMap[robotId] = {
                                    robotId,
                                    ...taskData,
                                    fetchedAt: Date.now()
                                };



                                // Update robot's task state in context
                                handleRobotTaskUpdate(selectedDeviceId, robotId, taskData);
                            }
                        } catch (err) {
                            // Robot might not have a task topic - that's okay

                        }
                    }));

                    setFetchedRobotTasks(prev => ({
                        ...prev,
                        [selectedDeviceId]: taskMap
                    }));


                } catch (err) {
                    console.error('[Device] Failed to auto-fetch robot tasks:', err);
                }
            })();
        }, 500); // 500ms delay to allow robot registry to populate

        return () => clearTimeout(timeoutId);
    }, [selectedDeviceId, isAuthenticated]); // Intentionally not including robots to avoid infinite loop

    // Check if a robot is busy (has an active/non-completed task)
    const isRobotBusy = useCallback((robotId) => {
        // First check the fetched tasks from API
        const deviceTasks = fetchedRobotTasks[selectedDeviceId] || {};
        const fetchedTask = deviceTasks[robotId];

        if (fetchedTask) {
            const status = fetchedTask.status || fetchedTask.state;
            if (isActiveTaskStatus(status)) {
                return true;
            }
        }

        // Also check the robot's current task state in context
        const robot = robots[selectedDeviceId]?.[robotId];
        if (robot?.task) {
            const taskStatus = robot.task.status || robot.task.state;
            // Check if task is active (not completed/failed/cancelled)
            if (isActiveTaskStatus(taskStatus)) {
                return true;
            }
        }

        return false;
    }, [selectedDeviceId, robots, fetchedRobotTasks]);

    // Get active task for a robot (if any)
    const getRobotActiveTask = useCallback((robotId) => {
        // First check fetched tasks from API
        const deviceTasks = fetchedRobotTasks[selectedDeviceId] || {};
        const fetchedTask = deviceTasks[robotId];

        if (fetchedTask && isActiveTaskStatus(fetchedTask.status || fetchedTask.state)) {
            return fetchedTask;
        }

        // Check robot's current task state in context
        const robot = robots[selectedDeviceId]?.[robotId];
        if (robot?.task && isActiveTaskStatus(robot.task.status || robot.task.state)) {
            return robot.task;
        }

        return null;
    }, [selectedDeviceId, robots, fetchedRobotTasks]);

    const value = {
        // WebSocket connection state
        isConnected,
        connectionError,

        // Device management
        factories: FACTORY_LOCATIONS,
        selectedFactoryId,
        setSelectedFactoryId,
        currentFactory,
        devices,
        allDevices: ALL_DEVICES,
        selectedDeviceId,
        setSelectedDeviceId,
        currentDevice,
        currentDeviceData,
        currentRobots,
        deviceData,
        robots,

        // Time-series histories (for Analysis graphs/tables)
        envHistory,
        robotHistory,
        getEnvHistory,
        getRobotHistory,

        // Alerts
        alerts,
        addAlert,
        clearAlert,
        clearAllAlerts,
        markAlertRead,
        markAllAlertsRead,

        // Robot management
        registerRobot,
        refreshDeviceState,
        updateRobotTaskLocal, // Exposed helper

        // Task update notification
        taskUpdateVersion,
        notifyTaskUpdate,

        // Task management functions
        fetchRobotTasks,      // Fetch all robot tasks from API
        isRobotBusy,          // Check if robot has an active task
        getRobotActiveTask,   // Get robot's current active task
        fetchedRobotTasks,    // Cached fetched tasks by device
        getLocalTaskHistory,  // Persistent local task history for all allocated tasks
        resetRobot,           // Reset a robot to free/idle state after task completion
    };

    return (
        <DeviceContext.Provider value={value}>
            {children}
        </DeviceContext.Provider>
    );
}

export function useDevice() {
    const context = useContext(DeviceContext);
    if (!context) {
        throw new Error('useDevice must be used within a DeviceProvider');
    }
    return context;
}

export default DeviceContext;
