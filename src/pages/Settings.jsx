/**
 * @module Settings
 * @description Settings page for device thresholds, system mode (Manual/Auto),
 * and robot task allocation. Persists settings to localStorage and
 * syncs task assignments to the backend via the State API.
 */
import { useState, useEffect, useRef } from 'react';
import {
    Thermometer,
    Battery,
    CheckCircle,
    ChevronDown,
    Smartphone,
    Power,
    RefreshCw,
    AlertCircle,
    Loader2
} from 'lucide-react';
import { useDevice } from '../contexts/DeviceContext';
import { updateStateDetails } from '../services/api';
import { ROOM_CENTERS, generateTaskId } from '../utils/telemetryMath';
import {
    getThresholds as getThresholdsShared,
    getTemperatureStatus,
    getHumidityStatus,
    getPressureStatus
} from '../utils/thresholds';

// Default thresholds
const DEFAULT_SETTINGS = {
    temperature: { min: 20, max: 40 },
    humidity: { min: 20, max: 70 },
    pressure: { min: 10, max: 40 },
    battery: { min: 20, critical: 10 },
    systemMode: 'MANUAL',
    robotSettings: {}
};

// ── Validation Rules ──────────────────────────────────────────────
const VALIDATION_RULES = {
    temperature: { absMin: -50, absMax: 100, unit: '°C' },
    humidity: { absMin: 0, absMax: 100, unit: '%' },
    pressure: { absMin: 300, absMax: 1100, unit: 'hPa' },
    battery: { absMin: 0, absMax: 100, unit: '%' },
    robotTemp: { absMin: -20, absMax: 120, unit: '°C' },
};

/**
 * Validate all device/threshold settings.
 * Returns an object keyed by "category.field" with error strings, or {} if valid.
 */
function validateSettings(s) {
    const errors = {};
    const r = VALIDATION_RULES;

    // ── Temperature ──
    const tMin = s.temperature?.min;
    const tMax = s.temperature?.max;
    if (tMin === '' || tMin == null) errors['temperature.min'] = 'Required';
    else if (tMin < r.temperature.absMin || tMin > r.temperature.absMax)
        errors['temperature.min'] = `Must be ${r.temperature.absMin}–${r.temperature.absMax} ${r.temperature.unit}`;
    if (tMax === '' || tMax == null) errors['temperature.max'] = 'Required';
    else if (tMax < r.temperature.absMin || tMax > r.temperature.absMax)
        errors['temperature.max'] = `Must be ${r.temperature.absMin}–${r.temperature.absMax} ${r.temperature.unit}`;
    if (tMin != null && tMax != null && tMin !== '' && tMax !== '' && Number(tMin) >= Number(tMax))
        errors['temperature.min'] = (errors['temperature.min'] || '') + ' Min must be less than Max';

    // ── Humidity ──
    const hMin = s.humidity?.min;
    const hMax = s.humidity?.max;
    if (hMin === '' || hMin == null) errors['humidity.min'] = 'Required';
    else if (hMin < r.humidity.absMin || hMin > r.humidity.absMax)
        errors['humidity.min'] = `Must be ${r.humidity.absMin}–${r.humidity.absMax} ${r.humidity.unit}`;
    if (hMax === '' || hMax == null) errors['humidity.max'] = 'Required';
    else if (hMax < r.humidity.absMin || hMax > r.humidity.absMax)
        errors['humidity.max'] = `Must be ${r.humidity.absMin}–${r.humidity.absMax} ${r.humidity.unit}`;
    if (hMin != null && hMax != null && hMin !== '' && hMax !== '' && Number(hMin) >= Number(hMax))
        errors['humidity.min'] = (errors['humidity.min'] || '') + ' Min must be less than Max';

    // ── Pressure ──
    const pMin = s.pressure?.min;
    const pMax = s.pressure?.max;
    if (pMin === '' || pMin == null) errors['pressure.min'] = 'Required';
    else if (pMin < r.pressure.absMin || pMin > r.pressure.absMax)
        errors['pressure.min'] = `Must be ${r.pressure.absMin}–${r.pressure.absMax} ${r.pressure.unit}`;
    if (pMax === '' || pMax == null) errors['pressure.max'] = 'Required';
    else if (pMax < r.pressure.absMin || pMax > r.pressure.absMax)
        errors['pressure.max'] = `Must be ${r.pressure.absMin}–${r.pressure.absMax} ${r.pressure.unit}`;
    if (pMin != null && pMax != null && pMin !== '' && pMax !== '' && Number(pMin) >= Number(pMax))
        errors['pressure.min'] = (errors['pressure.min'] || '') + ' Min must be less than Max';

    // ── Battery ──
    const bWarn = s.battery?.min;
    const bCrit = s.battery?.critical;
    if (bWarn === '' || bWarn == null) errors['battery.min'] = 'Required';
    else if (bWarn < r.battery.absMin || bWarn > r.battery.absMax)
        errors['battery.min'] = `Must be ${r.battery.absMin}–${r.battery.absMax} ${r.battery.unit}`;
    if (bCrit === '' || bCrit == null) errors['battery.critical'] = 'Required';
    else if (bCrit < r.battery.absMin || bCrit > r.battery.absMax)
        errors['battery.critical'] = `Must be ${r.battery.absMin}–${r.battery.absMax} ${r.battery.unit}`;
    if (bWarn != null && bCrit != null && bWarn !== '' && bCrit !== '' && Number(bCrit) >= Number(bWarn))
        errors['battery.critical'] = (errors['battery.critical'] || '') + ' Critical must be less than Warning';

    // ── Robot Temperature ──
    const rtMin = s.robotThresholds?.tempMin;
    const rtMax = s.robotThresholds?.tempMax;
    if (rtMin != null && rtMin !== '') {
        if (rtMin < r.robotTemp.absMin || rtMin > r.robotTemp.absMax)
            errors['robotTemp.min'] = `Must be ${r.robotTemp.absMin}–${r.robotTemp.absMax} ${r.robotTemp.unit}`;
    }
    if (rtMax != null && rtMax !== '') {
        if (rtMax < r.robotTemp.absMin || rtMax > r.robotTemp.absMax)
            errors['robotTemp.max'] = `Must be ${r.robotTemp.absMin}–${r.robotTemp.absMax} ${r.robotTemp.unit}`;
    }
    if (rtMin != null && rtMax != null && rtMin !== '' && rtMax !== '' && Number(rtMin) >= Number(rtMax))
        errors['robotTemp.min'] = (errors['robotTemp.min'] || '') + ' Min must be less than Max';

    return errors;
}

// Load settings from localStorage
const loadSettings = () => {
    try {
        const saved = localStorage.getItem('fabrix_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Deep merge to ensure new keys in DEFAULT are present
            return {
                ...DEFAULT_SETTINGS,
                ...parsed,
                robotSettings: { ...DEFAULT_SETTINGS.robotSettings, ...parsed.robotSettings }
            };
        }
    } catch (error) {
        console.error('[Settings] Failed to load settings:', error);
    }
    return DEFAULT_SETTINGS;
};

// Save settings to localStorage
const saveSettingsToStorage = (settings) => {
    try {
        localStorage.setItem('fabrix_settings', JSON.stringify(settings));
        return true;
    } catch (error) {
        console.error('[Settings] Failed to save settings:', error);
        return false;
    }
};

// Options — single Deliver task type (no dropdown needed)
const LOCATION_OPTIONS = ['Select', 'Cleanroom A', 'Cleanroom B', 'Loading Bay', 'Storage', 'Maintenance'];

// Room center coordinates from telemetryMath.js (derived from FabMap SVG zone geometry)
const LOCATION_COORDS = ROOM_CENTERS;

const getLocationCoordinates = (name) => {
    if (!name) return null;
    return LOCATION_COORDS[name] || null;
};

function Settings() {
    // 1. Context Access
    // Ensure selectedDeviceId is available from context for API calls
    const {
        currentRobots,
        currentDeviceData,
        updateRobotTaskLocal,
        selectedDeviceId,
        refreshDeviceState,
        isConnected,
        notifyTaskUpdate,
        fetchRobotTasks,     // Fetch robot tasks from API
        isRobotBusy,         // Check if robot has active task
        getRobotActiveTask   // Get robot's current active task
    } = useDevice();

    // 2. Local State
    const [settings, setSettings] = useState(loadSettings());
    const [deviceSaveMessage, setDeviceSaveMessage] = useState(null);
    const [robotSaveMessage, setRobotSaveMessage] = useState(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const [showValidation, setShowValidation] = useState(false);

    // Re-validate whenever settings change (only show if user already attempted save)
    useEffect(() => {
        if (showValidation) {
            setValidationErrors(validateSettings(settings));
        }
    }, [settings, showValidation]);

    // 3. Derived Data
    // Safely extract current environment values from streaming device data
    const currentValues = (currentDeviceData && currentDeviceData.environment) || {};
    // `currentRobots` is an object map in context — coerce to array for UI iteration
    const connectedRobots = Array.isArray(currentRobots) ? currentRobots : Object.values(currentRobots || {});

    // Helper: normalize environment metric keys (supports different payload shapes)
    const getMetricValue = (key) => {
        const env = currentValues || {};
        if (key === 'temperature') return env.temperature ?? env.ambient_temp ?? env.temp ?? env.ambientTemp ?? null;
        if (key === 'humidity') return env.humidity ?? env.ambient_hum ?? env.hum ?? env.ambientHum ?? null;
        if (key === 'pressure') return env.pressure ?? env.atmospheric_pressure ?? env.atm_pressure ?? env.atmosphericPressure ?? null;
        return null;
    };

    const getValueColorStyle = (status) => {
        switch (status) {
            case 'warning': return { color: '#D97706' };
            case 'critical': return { color: '#DC2626' };
            default: return { color: '#16A34A' };
        }
    };
    // 4. Handlers

    useEffect(() => {
        function onResize() {
            setIsMobile(window.innerWidth <= 768);
        }
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Update Device/System Settings (Nested updates)
    const updateDeviceSetting = (category, key, value) => {
        setSettings(prev => {
            // Handle System Mode (Root level)
            if (key === null) {
                return { ...prev, [category]: value };
            }
            // Handle Nested Settings (e.g., temperature.min)
            return {
                ...prev,
                [category]: {
                    ...prev[category],
                    [key]: value
                }
            };
        });
    };

    // Update Robot Configuration
    const updateRobotSetting = (robotId, key, value) => {
        setSettings(prev => ({
            ...prev,
            robotSettings: {
                ...prev.robotSettings,
                [robotId]: {
                    ...(prev.robotSettings[robotId] || {}),
                    [key]: value
                }
            }
        }));
    };

    // Save Device Settings (Local + API for System Mode) — with validation
    const handleSaveDeviceSettings = async () => {
        setShowValidation(true);
        const errors = validateSettings(settings);
        setValidationErrors(errors);

        if (Object.keys(errors).length > 0) {
            setDeviceSaveMessage({ type: 'error', text: 'Please fix the highlighted errors before saving.' });
            setTimeout(() => setDeviceSaveMessage(null), 4000);
            return;
        }

        // Build the thresholds object used by DeviceContext for severity computation
        const thresholds = {
            temperature: {
                min: Number(settings.temperature.min),
                max: Number(settings.temperature.max),
                critical: Number(settings.temperature.max) + 4,
            },
            humidity: {
                min: Number(settings.humidity.min),
                max: Number(settings.humidity.max),
                critical: Number(settings.humidity.max) + 15,
            },
            pressure: {
                min: Number(settings.pressure.min),
                max: Number(settings.pressure.max),
            },
            battery: {
                low: Number(settings.battery.min),
                critical: Number(settings.battery.critical ?? 10),
            },
        };

        saveSettingsToStorage({ ...settings, thresholds });

        // If System Mode changed, sync it to the cloud
        if (settings.systemMode && selectedDeviceId) {
            try {
                const topic = 'settings/systemMode';
                const payload = { mode: settings.systemMode };
                await updateStateDetails(selectedDeviceId, topic, payload);
            } catch (err) {
                console.error("Failed to sync system mode", err);
            }
        }

        setShowValidation(false);
        setDeviceSaveMessage({ type: 'success', text: 'Device settings saved!' });
        setTimeout(() => setDeviceSaveMessage(null), 3000);
    };

    // Helper: Get robot status
    const getRobotStatus = (robot) => {
        const robotStatus = robot?.['robot-status'] || robot?.robotStatus;
        if (robotStatus === 'online') return 'online';
        if (robotStatus === 'offline') return 'offline';

        const state = robot?.status?.state || robot?.status;
        if (state === 'Active' || state === 'online' || state === 'ACTIVE') return 'online';
        if (state === 'ERROR' || state === 'STOPPED' || state === 'offline') return 'offline';
        if (state === 'CHARGING' || state === 'IDLE' || state === 'Idle') return 'warning';

        return 'offline';
    };

    // Handle refresh to fetch robot tasks from API
    const handleRefreshTasks = async () => {
        setIsRefreshing(true);
        try {
            await fetchRobotTasks();
            setRobotSaveMessage({ type: 'success', text: 'Robot tasks refreshed from server' });
        } catch (err) {
            console.error('[Settings] Failed to refresh robot tasks:', err);
            setRobotSaveMessage({ type: 'error', text: 'Failed to refresh robot tasks' });
        } finally {
            setIsRefreshing(false);
            setTimeout(() => setRobotSaveMessage(null), 3000);
        }
    };

    // Fetch robot tasks only once on initial load (page refresh)
    // This runs once when the component mounts and device is available
    const hasFetchedRef = useRef(false);
    useEffect(() => {
        if (selectedDeviceId && fetchRobotTasks && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchRobotTasks();
        }
        // Reset when device changes
        if (!selectedDeviceId) {
            hasFetchedRef.current = false;
        }
    }, [selectedDeviceId]); // Only depend on selectedDeviceId, not fetchRobotTasks

    return (
        <div className="settings-page">
            {/* Device Settings Section */}
            <div className="settings-section">
                <div className="device-settings-header">
                    <div className="settings-flex-row">
                        <h2 className="settings-title">
                            Device Settings
                        </h2>
                        <div title={isConnected ? 'Live (connected)' : 'Disconnected'} className="status-indicator">
                            <span className={`status-dot ${isConnected ? 'status-dot--online' : 'status-dot--offline'}`} />
                            <span className="status-indicator__label">{isConnected ? 'Live' : 'Disconnected'}</span>
                        </div>
                    </div>

                    {/* System Control Toggle */}
                    <div className="system-toggle">
                        <span className="settings-mode-label">System Mode:</span>
                        <span className="settings-mode-value">{settings.systemMode}</span>
                        <button
                            onClick={async () => {
                                // Optimistic UI update and send control request
                                const prevMode = settings.systemMode;
                                const newMode = prevMode === 'MANUAL' ? 'AUTOMATIC' : 'MANUAL';
                                // Optimistically update local UI
                                updateDeviceSetting('systemMode', null, newMode);

                                if (!selectedDeviceId) {
                                    setDeviceSaveMessage({ type: 'error', text: 'No device selected' });
                                    setTimeout(() => setDeviceSaveMessage(null), 3000);
                                    return;
                                }

                                try {
                                    // Send update to device topic 'fleetMS/mode'
                                    await updateStateDetails(selectedDeviceId, 'fleetMS/mode', { mode: newMode });

                                    // After updating, refresh device state from API to sync local context
                                    try {
                                        if (refreshDeviceState) await refreshDeviceState();
                                    } catch (err) {
                                        console.warn('[Settings] Failed to refresh device state after mode update', err);
                                    }

                                    setDeviceSaveMessage({ type: 'success', text: `System mode set to ${newMode}` });
                                } catch (err) {
                                    console.error('[Settings] Failed to update system mode:', err);
                                    // Revert optimistic change on failure
                                    updateDeviceSetting('systemMode', null, prevMode);
                                    setDeviceSaveMessage({ type: 'error', text: 'Failed to update system mode' });
                                } finally {
                                    setTimeout(() => setDeviceSaveMessage(null), 3000);
                                }
                            }}
                            className={`settings-mode-toggle ${settings.systemMode === 'AUTOMATIC' ? 'settings-mode-toggle--active' : ''}`}
                        >
                            <Power size={16} className="settings-mode-toggle__icon" />
                            <Smartphone size={16} className="settings-mode-toggle__icon" />
                        </button>
                    </div>
                </div>

                {/* Expanded Threshold Cards - Device + Robot Sensors */}
                <div className="settings-threshold-grid">
                    {[
                        { title: 'Temperature', fields: [{ l: 'Min (°C)', k: 'min' }, { l: 'Max (°C)', k: 'max' }], key: 'temperature', rule: VALIDATION_RULES.temperature },
                        { title: 'Humidity', fields: [{ l: 'Min (%)', k: 'min' }, { l: 'Max (%)', k: 'max' }], key: 'humidity', rule: VALIDATION_RULES.humidity },
                        { title: 'Pressure', fields: [{ l: 'Min (hPa)', k: 'min' }, { l: 'Max (hPa)', k: 'max' }], key: 'pressure', rule: VALIDATION_RULES.pressure }
                    ].map((card) => {
                        const raw = getMetricValue(card.key);
                        let formatted;
                        let status = 'normal';
                        if (card.key === 'temperature') {
                            formatted = raw != null ? `${Number(raw).toFixed(1)}°C` : '-- °C';
                            status = getTemperatureStatus(raw);
                        } else if (card.key === 'humidity') {
                            formatted = raw != null ? `${Number(raw).toFixed(1)}%` : '-- %';
                            status = getHumidityStatus(raw);
                        } else if (card.key === 'pressure') {
                            formatted = raw != null ? `${raw} hPa` : '-- hPa';
                            status = getPressureStatus(raw);
                        }

                        return (
                            <div key={card.title} className="settings-threshold-card">
                                <div className="settings-threshold-card__header">
                                    <h3 className="settings-threshold-card__title">{card.title}</h3>
                                    <p className="settings-threshold-subtitle">Current: <span style={{ ...getValueColorStyle(status), fontWeight: '600' }}>{formatted}</span></p>
                                    <p className="settings-threshold-range">Range: {card.rule.absMin} – {card.rule.absMax} {card.rule.unit}</p>
                                </div>
                                <div className="settings-input-grid" style={card.fields.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
                                    {card.fields.map(f => {
                                        const errKey = `${card.key}.${f.k}`;
                                        const hasError = showValidation && validationErrors[errKey];
                                        return (
                                            <div key={f.k}>
                                                <label className="settings-input-label">{f.l}</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={settings[card.key]?.[f.k] ?? ''}
                                                    onChange={(e) => updateDeviceSetting(card.key, f.k, e.target.value === '' ? '' : Number(e.target.value))}
                                                    className={`settings-input ${hasError ? 'settings-input--error' : ''}`}
                                                />
                                                {hasError && (
                                                    <p className="settings-error-text">{validationErrors[errKey]}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* Robot Battery Threshold - in same grid */}
                    <div className="settings-threshold-card">
                        <div className="settings-threshold-card__header">
                            <h3 className="settings-threshold-card__title settings-threshold-card__title--flex">
                                Battery
                                <span className="settings-robot-badge">Robot</span>
                            </h3>
                            <p className="settings-threshold-subtitle">Battery levels</p>
                            <p className="settings-threshold-range">Warning must be greater than Critical (0–100%)</p>
                        </div>
                        <div className="settings-input-grid">
                            <div>
                                <label className="settings-input-label">Warning (%)</label>
                                <input
                                    type="number"
                                    value={settings.battery?.min ?? 20}
                                    onChange={(e) => updateDeviceSetting('battery', 'min', e.target.value === '' ? '' : Number(e.target.value))}
                                    className={`settings-input ${(showValidation && validationErrors['battery.min']) ? 'settings-input--error' : ''}`}
                                />
                                {showValidation && validationErrors['battery.min'] && (
                                    <p className="settings-error-text">{validationErrors['battery.min']}</p>
                                )}
                            </div>
                            <div>
                                <label className="settings-input-label">Critical (%)</label>
                                <input
                                    type="number"
                                    value={settings.battery?.critical ?? 10}
                                    onChange={(e) => updateDeviceSetting('battery', 'critical', e.target.value === '' ? '' : Number(e.target.value))}
                                    className={`settings-input ${(showValidation && validationErrors['battery.critical']) ? 'settings-input--error' : ''}`}
                                />
                                {showValidation && validationErrors['battery.critical'] && (
                                    <p className="settings-error-text">{validationErrors['battery.critical']}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Robot Temperature Threshold - in same grid */}
                    <div className="settings-threshold-card">
                        <div className="settings-threshold-card__header">
                            <h3 className="settings-threshold-card__title settings-threshold-card__title--flex">
                                Temperature
                                <span className="settings-robot-badge">Robot</span>
                            </h3>
                            <p className="settings-threshold-subtitle">Motor/body temp</p>
                            <p className="settings-threshold-range">Range: {VALIDATION_RULES.robotTemp.absMin} – {VALIDATION_RULES.robotTemp.absMax} {VALIDATION_RULES.robotTemp.unit}</p>
                        </div>
                        <div className="settings-input-grid">
                            <div>
                                <label className="settings-input-label">Min (°C)</label>
                                <input
                                    type="number"
                                    value={settings.robotThresholds?.tempMin ?? 15}
                                    onChange={(e) => setSettings(prev => ({
                                        ...prev,
                                        robotThresholds: {
                                            ...prev.robotThresholds,
                                            tempMin: e.target.value === '' ? '' : Number(e.target.value)
                                        }
                                    }))}
                                    className={`settings-input ${(showValidation && validationErrors['robotTemp.min']) ? 'settings-input--error' : ''}`}
                                />
                                {showValidation && validationErrors['robotTemp.min'] && (
                                    <p className="settings-error-text">{validationErrors['robotTemp.min']}</p>
                                )}
                            </div>
                            <div>
                                <label className="settings-input-label">Max (°C)</label>
                                <input
                                    type="number"
                                    value={settings.robotThresholds?.tempMax ?? 45}
                                    onChange={(e) => setSettings(prev => ({
                                        ...prev,
                                        robotThresholds: {
                                            ...prev.robotThresholds,
                                            tempMax: e.target.value === '' ? '' : Number(e.target.value)
                                        }
                                    }))}
                                    className={`settings-input ${(showValidation && validationErrors['robotTemp.max']) ? 'settings-input--error' : ''}`}
                                />
                                {showValidation && validationErrors['robotTemp.max'] && (
                                    <p className="settings-error-text">{validationErrors['robotTemp.max']}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Message & Action */}
                <div className="settings-actions">
                    {deviceSaveMessage && (
                        <div className={`settings-message ${deviceSaveMessage.type === 'error' ? 'settings-message--error' : 'settings-message--success'}`}>
                            {deviceSaveMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                            {deviceSaveMessage.text}
                        </div>
                    )}
                    <button
                        onClick={handleSaveDeviceSettings}
                        className="settings-save-btn"
                    >
                        Save Device Settings
                    </button>
                </div>
            </div>

            {/* Robot Settings Section */}
            <div className="settings-section settings-section--fleet">
                <div className="settings-fleet-header">
                    <h2 className="settings-title">
                        Robot Fleet Overview
                        <span className="settings-title-sub">
                            ({connectedRobots.length} Robots Online)
                        </span>
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={async () => {
                                // Start all idle robots simultaneously
                                const idleRobots = connectedRobots.filter(robot => {
                                    const robotId = robot.id;
                                    const isBusy = isRobotBusy ? isRobotBusy(robotId) : false;
                                    const robotSettings = settings.robotSettings?.[robotId] || {};
                                    const hasValidConfig = robotSettings.source && robotSettings.destination &&
                                        robotSettings.source !== 'Select' && robotSettings.destination !== 'Select' &&
                                        robotSettings.source !== robotSettings.destination;
                                    return !isBusy && hasValidConfig;
                                });

                                if (idleRobots.length === 0) {
                                    setRobotSaveMessage({
                                        type: 'error',
                                        text: 'No idle robots with valid tasks configured. Configure source and destination for idle robots first.'
                                    });
                                    setTimeout(() => setRobotSaveMessage(null), 4000);
                                    return;
                                }

                                if (!selectedDeviceId) {
                                    setRobotSaveMessage({ type: 'error', text: 'No device selected.' });
                                    setTimeout(() => setRobotSaveMessage(null), 3000);
                                    return;
                                }

                                setIsRefreshing(true);
                                const results = [];
                                const errors = [];

                                // Assign tasks to all idle robots concurrently
                                await Promise.allSettled(
                                    idleRobots.map(async (robot) => {
                                        const robotId = robot.id;
                                        const config = settings.robotSettings?.[robotId] || {};

                                        try {
                                            const srcCoords = getLocationCoordinates(config.source);
                                            const dstCoords = getLocationCoordinates(config.destination);
                                            const taskId = generateTaskId();

                                            const payload = {
                                                robotId: robotId,
                                                task_type: 'Deliver',
                                                task_id: taskId,
                                                status: 'Assigned',
                                                assignedAt: new Date().toISOString(),
                                                'initiate location': config.source,
                                                destination: config.destination,
                                                source_lat: srcCoords?.lat ?? null,
                                                source_lng: srcCoords?.lng ?? null,
                                                destination_lat: dstCoords?.lat ?? null,
                                                destination_lng: dstCoords?.lng ?? null
                                            };

                                            // Optimistic local update
                                            if (updateRobotTaskLocal) updateRobotTaskLocal(robotId, payload);

                                            // Send to API
                                            await updateStateDetails(selectedDeviceId, `fleetMS/robots/${robotId}/task`, payload);

                                            results.push(robotId);
                                        } catch (err) {
                                            console.error(`[Settings] Failed to assign task to ${robotId}:`, err);
                                            errors.push(robotId);
                                        }
                                    })
                                );

                                // Notify other components
                                if (notifyTaskUpdate) notifyTaskUpdate();

                                setIsRefreshing(false);

                                if (errors.length === 0) {
                                    setRobotSaveMessage({
                                        type: 'success',
                                        text: `✅ Started ${results.length} robot${results.length > 1 ? 's' : ''} working simultaneously!`
                                    });
                                } else if (results.length > 0) {
                                    setRobotSaveMessage({
                                        type: 'warning',
                                        text: `Started ${results.length} robots. Failed: ${errors.length}`
                                    });
                                } else {
                                    setRobotSaveMessage({
                                        type: 'error',
                                        text: `Failed to start robots. Check console for details.`
                                    });
                                }
                                setTimeout(() => setRobotSaveMessage(null), 5000);
                            }}
                            disabled={isRefreshing}
                            className="settings-refresh-btn"
                            style={{
                                background: 'linear-gradient(135deg, #10B981, #059669)',
                                color: 'white',
                                fontWeight: '600'
                            }}
                            title="Assign tasks to all idle robots and start them working simultaneously"
                        >
                            {isRefreshing ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <CheckCircle size={14} />
                            )}
                            Start All Robots
                        </button>
                        <button
                            onClick={handleRefreshTasks}
                            disabled={isRefreshing}
                            className="settings-refresh-btn"
                            title="Refresh robot tasks from server"
                        >
                            {isRefreshing ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <RefreshCw size={14} />
                            )}
                            Refresh
                        </button>
                    </div>
                </div>

                {connectedRobots.length === 0 ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-state__icon">🤖</div>
                        <p className="settings-empty-state__text">Waiting for robot data sync...</p>
                    </div>
                ) : (
                    <div className="robot-settings-grid">
                        {connectedRobots.map((robot, index) => {
                            const robotId = robot.id;
                            const robotSettings = settings.robotSettings?.[robotId] || {};
                            const status = getRobotStatus(robot);
                            const robotNumber = robotId.match(/\d+/)?.[0] || String(index + 1).padStart(2, '0');
                            const displayId = `R-${robotNumber}`;

                            // Check if robot is busy with an active task
                            const isBusy = isRobotBusy ? isRobotBusy(robotId) : false;
                            const activeTask = getRobotActiveTask ? getRobotActiveTask(robotId) : null;

                            return (
                                <div
                                    key={robotId}
                                    className="settings-robot-card"
                                >
                                    <div className="settings-robot-card__header">
                                        <div className="settings-flex-row" style={{ gap: '8px' }}>
                                            <h3 className="settings-robot-card__name">{displayId}</h3>
                                            {isBusy && (
                                                <span className="settings-active-badge">
                                                    <AlertCircle size={10} />
                                                    Active Task
                                                </span>
                                            )}
                                        </div>
                                        <div className={`status-dot ${(Date.now() - (robot.lastUpdate || 0)) / 1000 <= 60 ? 'status-dot--online' : 'status-dot--offline'}`} title={robot.lastUpdate ? `Last stream: ${new Date(robot.lastUpdate).toLocaleTimeString()}` : 'No recent stream data'} />
                                    </div>

                                    {/* Show active task info when robot is busy */}
                                    {isBusy && activeTask && (
                                        <div className="settings-task-info">
                                            <div className="settings-task-info__title">
                                                Delivering — {activeTask.task_id || activeTask.taskId || 'In Progress'}
                                            </div>
                                            {activeTask.destination && (
                                                <div className="settings-task-info__route">
                                                    {activeTask['initiate location'] || activeTask.source || '?'} → {typeof activeTask.destination === 'string' ? activeTask.destination : 'Destination'}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <label className="settings-field-label">Task Type</label>
                                        <div className="settings-task-type">
                                            📦 Deliver
                                        </div>
                                    </div>

                                    <div>
                                        <label className="settings-field-label">Initiate Location</label>
                                        <div className="settings-select-wrap">
                                            <select
                                                value={robotSettings.source || ''}
                                                onChange={(e) => updateRobotSetting(robotId, 'source', e.target.value)}
                                                disabled={isBusy}
                                                className="settings-select"
                                            >
                                                {LOCATION_OPTIONS.map(opt => <option key={opt} value={opt === 'Select' ? '' : opt}>{opt}</option>)}
                                            </select>
                                            <ChevronDown size={14} className="settings-select-icon" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="settings-field-label">Destination</label>
                                        <div className="settings-select-wrap">
                                            <select
                                                value={robotSettings.destination || ''}
                                                onChange={(e) => updateRobotSetting(robotId, 'destination', e.target.value)}
                                                disabled={isBusy}
                                                className="settings-select"
                                            >
                                                {LOCATION_OPTIONS.map(opt => <option key={opt} value={opt === 'Select' ? '' : opt}>{opt}</option>)}
                                            </select>
                                            <ChevronDown size={14} className="settings-select-icon" />
                                        </div>
                                    </div>

                                    {/* Assign/Clear buttons directly below Destination */}
                                    <div className="settings-btn-row">
                                        <button
                                            disabled={isBusy}
                                            onClick={async () => {
                                                // Check if robot is busy before assigning
                                                if (isBusy) {
                                                    setRobotSaveMessage({
                                                        type: 'error',
                                                        text: `${displayId} is busy with an active task. Please wait until the current task is completed.`
                                                    });
                                                    setTimeout(() => setRobotSaveMessage(null), 4000);
                                                    return;
                                                }

                                                const config = settings.robotSettings?.[robotId] || {};

                                                // Require source and destination for a Deliver task
                                                if (!config.source || config.source === 'Select') {
                                                    setRobotSaveMessage({ type: 'error', text: `Select a source for ${displayId}` });
                                                    setTimeout(() => setRobotSaveMessage(null), 3000);
                                                    return;
                                                }
                                                if (!config.destination || config.destination === 'Select') {
                                                    setRobotSaveMessage({ type: 'error', text: `Select a destination for ${displayId}` });
                                                    setTimeout(() => setRobotSaveMessage(null), 3000);
                                                    return;
                                                }
                                                if (config.source === config.destination) {
                                                    setRobotSaveMessage({ type: 'error', text: `Source and destination cannot be the same for ${displayId}` });
                                                    setTimeout(() => setRobotSaveMessage(null), 3000);
                                                    return;
                                                }

                                                if (!selectedDeviceId) {
                                                    setRobotSaveMessage({ type: 'error', text: 'No device selected for sync.' });
                                                    setTimeout(() => setRobotSaveMessage(null), 3000);
                                                    return;
                                                }

                                                try {
                                                    const srcCoords = getLocationCoordinates(config.source);
                                                    const dstCoords = getLocationCoordinates(config.destination);
                                                    const taskId = generateTaskId();

                                                    const payload = {
                                                        robotId: robotId,
                                                        task_type: 'Deliver',
                                                        task_id: taskId,
                                                        status: 'Assigned',
                                                        assignedAt: new Date().toISOString(),
                                                        'initiate location': config.source || 'Unknown',
                                                        destination: config.destination || 'Unknown',
                                                        source_lat: srcCoords?.lat ?? null,
                                                        source_lng: srcCoords?.lng ?? null,
                                                        destination_lat: dstCoords?.lat ?? null,
                                                        destination_lng: dstCoords?.lng ?? null
                                                    };

                                                    // Optimistic local update
                                                    if (updateRobotTaskLocal) updateRobotTaskLocal(robotId, payload);

                                                    // Send to API
                                                    await updateStateDetails(selectedDeviceId, `fleetMS/robots/${robotId}/task`, payload);

                                                    // Notify other components (like Analysis) that task was updated
                                                    if (notifyTaskUpdate) notifyTaskUpdate();

                                                    setRobotSaveMessage({ type: 'success', text: `Saved task for ${robotId}` });
                                                } catch (err) {
                                                    console.error('[Settings] Failed to save robot setting:', err);
                                                    setRobotSaveMessage({ type: 'error', text: `Failed to sync ${robotId}` });
                                                } finally {
                                                    setTimeout(() => setRobotSaveMessage(null), 3500);
                                                }
                                            }}
                                            className="settings-assign-btn"
                                            title={isBusy ? 'Robot is busy with an active task' : 'Assign task to robot'}
                                        >
                                            {isBusy ? 'Busy' : 'Assign'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Clear robot-specific settings
                                                updateRobotSetting(robotId, 'source', '');
                                                updateRobotSetting(robotId, 'destination', '');
                                                setRobotSaveMessage({ type: 'success', text: `Cleared settings for ${displayId}` });
                                                setTimeout(() => setRobotSaveMessage(null), 2000);
                                            }}
                                            className="settings-clear-btn"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {/* Robot Fleet Save Message */}
                <div className="settings-actions settings-actions--mt">
                    {robotSaveMessage && (
                        <div className={`settings-message ${robotSaveMessage.type === 'error' ? 'settings-message--error' : 'settings-message--success'}`}>
                            {robotSaveMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                            {robotSaveMessage.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Settings;