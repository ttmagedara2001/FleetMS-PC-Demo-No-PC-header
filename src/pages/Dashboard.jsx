/**
 * @module Dashboard
 * @description Main dashboard page with fab floor map, environment status cards,
 * HVAC control toggles, active alerts, and robot detail cards.
 */
import { useState, useEffect, useRef } from 'react';
import {
    Bot,
    Thermometer,
    Gauge,
    AlertTriangle,
    CheckCircle,
    Battery,
    Loader2,
    RefreshCw,
    ArrowLeft,
    Map,
    ChevronRight
} from 'lucide-react';
import { useDevice } from '../contexts/DeviceContext';
import { toggleAC, setAirPurifier } from '../services/api';
import { getFactoryMapZones } from '../config/factoryRegistry';
import { TASK_PHASES, PHASE_LABELS, PHASE_COLORS, FACILITY_BOUNDS as SHARED_FACILITY_BOUNDS, gpsToPercent as sharedGpsToPercent, percentToGps as sharedPercentToGps } from '../utils/telemetryMath';

// Fab Map Component
function FabMap() {
    const { currentRobots, currentFactory } = useDevice();
    const [selectedRobot, setSelectedRobot] = useState(null);
    const [clickedCoords, setClickedCoords] = useState(null); // { lat, lng, x, y }
    const mapRef = useRef(null);

    const robots = Object.values(currentRobots || {});

    // Zone definitions
    const zones = getFactoryMapZones(currentFactory?.id);

    // Use shared facility bounds and GPS conversion from telemetryMath (single source of truth)
    const FACILITY_BOUNDS = SHARED_FACILITY_BOUNDS;
    const gpsToPercent = (lat, lng) => sharedGpsToPercent(lat, lng);
    const percentToGps = (xPercent, yPercent) => sharedPercentToGps(xPercent, yPercent);

    // Handle map click to show coordinates
    const handleMapClick = (e) => {
        if (!mapRef.current) return;

        const rect = mapRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Convert to percentages
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;

        // Convert to GPS
        const { lat, lng } = percentToGps(xPercent, yPercent);

        setClickedCoords({
            lat: lat,
            lng: lng,
            xPercent: xPercent,
            yPercent: yPercent,
            screenX: x,
            screenY: y
        });

        // Clear selected robot when clicking on map
        setSelectedRobot(null);
    };

    // Copy coordinates to clipboard
    const copyToClipboard = () => {
        if (clickedCoords) {
            const text = `${clickedCoords.lat.toFixed(6)}, ${clickedCoords.lng.toFixed(6)}`;
            navigator.clipboard.writeText(text);
        }
    };

    const getStatusColor = (robot) => {
        // Prefer computed severity when available
        const sev = robot?.severity;
        if (sev) {
            // If either battery or temp is critical -> critical color
            if (sev.battery === 'critical' || sev.temp === 'critical') return '#DC2626';
            if (sev.battery === 'warning' || sev.temp === 'warning') return '#22C55E';
            return '#22C55E';
        }
        const state = robot?.status?.state?.toUpperCase();
        if (state === 'ERROR' || state === 'STOPPED') return '#EF4444';
        if (state === 'CHARGING') return '#22C55E';
        if (state === 'ACTIVE' || state === 'MOVING') return '#22C55E';
        return '#9CA3AF'; // Gray for Ready/Idle
    };

    const getBatteryColorStyle = (battery) => {
        if (battery == null) return { color: '#111827' };
        if (battery < 15) return { color: '#DC2626' }; // red-600
        if (battery < 40) return { color: '#22C55E' }; // map amber -> green
        return { color: '#16A34A' }; // green-600
    };

    const getProgressColorStyle = (progress) => {
        if (progress == null) return { color: '#111827' };
        if (progress < 20) return { color: '#DC2626' };
        if (progress < 50) return { color: '#22C55E' };
        return { color: '#16A34A' };
    };

    return (
        <div className="fab-map-container">
            <div
                className="fab-map"
                ref={mapRef}
                onClick={handleMapClick}
                style={{ cursor: 'crosshair' }}
            >
                {/* Zones */}
                {zones.map(zone => (
                    <div
                        key={zone.id}
                        className={`fab-zone ${zone.type}`}
                        style={{
                            left: zone.left,
                            top: zone.top,
                            width: zone.width,
                            height: zone.height,
                        }}
                        onClick={(e) => e.stopPropagation()} // Don't trigger map click
                    >
                        {zone.name}
                    </div>
                ))}

                {/* Clicked Position Marker & Tooltip */}
                {clickedCoords && (
                    <>
                        {/* Position marker */}
                        <div
                            className="map-click-marker"
                            style={{ left: `${clickedCoords.xPercent}%`, top: `${clickedCoords.yPercent}%` }}
                        />
                        {/* Coordinates tooltip */}
                        <div
                            className="map-click-tooltip"
                            style={{
                                left: `${Math.min(clickedCoords.xPercent, 75)}%`,
                                top: `${clickedCoords.yPercent < 20 ? clickedCoords.yPercent + 5 : clickedCoords.yPercent - 15}%`
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="map-click-tooltip__header">
                                <span className="map-click-tooltip__label">
                                    📍 Clicked Position
                                </span>
                                <button
                                    onClick={() => setClickedCoords(null)}
                                    className="map-click-tooltip__close"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="map-click-tooltip__row">
                                <span className="map-click-tooltip__key">Latitude:</span>
                                <span className="map-click-tooltip__value">
                                    {clickedCoords.lat.toFixed(6)}
                                </span>
                            </div>
                            <div className="map-click-tooltip__row map-click-tooltip__row--mb">
                                <span className="map-click-tooltip__key">Longitude:</span>
                                <span className="map-click-tooltip__value">
                                    {clickedCoords.lng.toFixed(6)}
                                </span>
                            </div>
                            <button
                                onClick={copyToClipboard}
                                className="map-click-tooltip__copy-btn"
                            >
                                📋 Copy Coordinates
                            </button>
                        </div>
                    </>
                )}

                {/* Robot Markers */}
                {robots.map((robot, index) => {
                    // Check if robot has valid location data
                    const hasLocation = robot.location &&
                        robot.location.lat !== null &&
                        robot.location.lng !== null &&
                        (robot.location.lat !== 0 || robot.location.lng !== 0);

                    let x, y;
                    if (hasLocation) {
                        // If coordinates look like GPS (lat between -90..90 and lng between -180..180), use gpsToPercent
                        const lat = Number(robot.location.lat);
                        const lng = Number(robot.location.lng);
                        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                            const p = gpsToPercent(lat, lng);
                            x = p.xPercent;
                            y = p.yPercent;
                        } else {
                            // Fallback: treat lat/lng as normalized 0..1 coordinates
                            x = 5 + (robot.location.lng * 90);  // 0 -> 5%, 1 -> 95%
                            y = 5 + (robot.location.lat * 90);  // 0 -> 5%, 1 -> 95%
                        }
                    } else {
                        // Spread robots across different functional zones by default (fallback positions)
                        const defaultPositions = [
                            { x: 20, y: 25 }, // Cleanroom A
                            { x: 60, y: 25 }, // Cleanroom B
                            { x: 18, y: 72 }, // Loading Bay
                            { x: 48, y: 72 }, // Storage
                            { x: 78, y: 68 }  // Maintenance
                        ];
                        const pos = defaultPositions[index % defaultPositions.length];
                        x = pos.x;
                        y = pos.y;
                    }

                    return (
                        <div
                            key={robot.id}
                            className="robot-marker"
                            style={{ left: `${x}%`, top: `${y}%` }}
                            onClick={(e) => {
                                e.stopPropagation(); // Don't trigger map click
                                setSelectedRobot(selectedRobot?.id === robot.id ? null : robot);
                                setClickedCoords(null); // Close coords tooltip
                            }}
                        >
                            {robot.id.replace('R-', 'R')}
                            <div
                                className="status-dot"
                                style={{ background: getStatusColor(robot) }}
                            />
                            <div className="robot-hover">
                                <div className="robot-hover-title">{robot.id}</div>
                                <div className="robot-hover-row">
                                    <span className="label">Lat:</span>
                                    <span className="value">{hasLocation ? Number(robot.location.lat).toFixed(5) : '—'}</span>
                                </div>
                                <div className="robot-hover-row">
                                    <span className="label">Lng:</span>
                                    <span className="value">{hasLocation ? Number(robot.location.lng).toFixed(5) : '—'}</span>
                                </div>
                                <div className="robot-hover-row">
                                    <span className="label">Bat:</span>
                                    <span className="value" style={getBatteryColorStyle(robot.status?.battery)}>{robot.status?.battery != null ? `${robot.status.battery}%` : '--'}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Robot Tooltip */}
                {selectedRobot && (
                    <div
                        className="robot-tooltip"
                        style={{
                            left: `${20 + (selectedRobot.location?.lng || 0) * 60}%`,
                            top: `${10 + (selectedRobot.location?.lat || 0) * 50}%`
                        }}
                    >
                        <h4>ROBOT {selectedRobot.id}</h4>
                        <div className="robot-tooltip-row">
                            <span className="label">LOC (LAT/LNG):</span>
                            <span className="value">
                                {selectedRobot.location?.lat?.toFixed(3) || '0.000'},
                                {selectedRobot.location?.lng?.toFixed(3) || '0.000'}
                            </span>
                        </div>
                        <div className="robot-tooltip-row">
                            <span className="label">STATUS:</span>
                            <span className="value" style={{ color: getStatusColor(selectedRobot) }}>
                                {selectedRobot.status?.state || 'READY'}
                            </span>
                        </div>
                        <div className="robot-tooltip-row">
                            <span className="label">BATTERY:</span>
                            <span className="value" style={getBatteryColorStyle(selectedRobot.status?.battery)}>{selectedRobot.status?.battery != null ? `${selectedRobot.status.battery}%` : '--'}</span>
                        </div>
                        <div className="robot-tooltip-row">
                            <span className="label">CURRENT TASK:</span>
                            <span className="value">
                                {selectedRobot.task?.status === 'Completed'
                                    ? `✓ ${selectedRobot.task.type || 'Task'} (Done)`
                                    : (selectedRobot.task?.type || (selectedRobot.status?.state === 'READY' ? 'Ready for Assignment' : 'None'))}
                            </span>
                        </div>
                        {selectedRobot.task?.progress != null && (
                            <div className="robot-tooltip-row">
                                <span className="label">PROGRESS:</span>
                                <span className="value" style={selectedRobot.task.progress >= 100 ? { color: '#059669' } : getProgressColorStyle(selectedRobot.task.progress)}>
                                    {selectedRobot.task.progress >= 100 ? '100% ✓' : `${selectedRobot.task.progress}%`}
                                </span>
                            </div>
                        )}
                        {/* Show ready-for-assignment indicator when no active task */}
                        {!selectedRobot.task && selectedRobot.status?.state === 'READY' && (
                            <div className="robot-tooltip-row">
                                <span className="label">AVAILABILITY:</span>
                                <span className="value" style={{ color: '#059669', fontWeight: 700 }}>✅ Ready</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Task Progress Overlay - Shows only when there are active tasks */}
                {robots.length > 0 && robots.some(r => r.task) && (
                    <div className="task-progress-overlay">
                        <div className="task-progress-label">Active Tasks:</div>
                        <div className="task-progress-value">{robots.filter(r => r.task).length}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Status Card Component
function StatusCard() {
    const { currentDeviceData, selectedDeviceId, isConnected, currentDevice } = useDevice();

    const env = currentDeviceData?.environment || {};

    // Normalize metric keys and status/color helpers
    const getMetricValue = (key) => {
        if (key === 'temperature') return env.temperature ?? env.ambient_temp ?? env.temp ?? env.ambientTemp ?? null;
        if (key === 'humidity') return env.humidity ?? env.ambient_hum ?? env.hum ?? env.ambientHum ?? null;
        if (key === 'pressure') return env.pressure ?? env.atmospheric_pressure ?? env.atm_pressure ?? env.atmosphericPressure ?? null;
        return null;
    };

    const getTemperatureStatus = (temp) => {
        if (temp == null) return 'normal';
        // Try to read user settings from localStorage
        try {
            const raw = localStorage.getItem('fabrix_settings');
            if (raw) {
                const s = JSON.parse(raw);
                const t = s.temperature || {};
                const min = typeof t.min === 'number' ? t.min : 20;
                const max = typeof t.max === 'number' ? t.max : 40;
                // Critical when outside configured range
                if (temp > max || temp < min) return 'critical';
                // Warning when within 3 degrees of either bound
                if (temp > (max - 3) || temp < (min + 3)) return 'warning';
                return 'normal';
            }
        } catch (e) {
            console.warn('[Dashboard] Failed to parse settings for temperature status', e);
        }
        // Fallback to original thresholds
        if (temp > 28) return 'critical';
        if (temp > 25) return 'warning';
        return 'normal';
    };

    const getHumidityStatus = (hum) => {
        if (hum == null) return 'normal';
        try {
            const raw = localStorage.getItem('fabrix_settings');
            if (raw) {
                const s = JSON.parse(raw);
                const h = s.humidity || {};
                const min = typeof h.min === 'number' ? h.min : 30;
                const max = typeof h.max === 'number' ? h.max : 60;
                if (hum > max || hum < min) return 'critical';
                if (hum > (max - 5) || hum < (min + 5)) return 'warning';
                return 'normal';
            }
        } catch (e) {
            console.warn('[Dashboard] Failed to parse settings for humidity status', e);
        }
        if (hum > 60 || hum < 30) return 'critical';
        if (hum > 55 || hum < 35) return 'warning';
        return 'normal';
    };

    const getPressureStatus = (p) => {
        if (p == null) return 'normal';
        try {
            const raw = localStorage.getItem('fabrix_settings');
            if (raw) {
                const s = JSON.parse(raw);
                const pr = s.pressure || {};
                // If user provided reasonable hPa values, use them; otherwise fallback to hardcoded logic
                if (typeof pr.min === 'number' && typeof pr.max === 'number') {
                    const min = pr.min;
                    const max = pr.max;
                    if (p > max || p < min) return 'critical';
                    if (p > (max - 10) || p < (min + 10)) return 'warning';
                    return 'normal';
                }
            }
        } catch (e) {
            console.warn('[Dashboard] Failed to parse settings for pressure status', e);
        }
        if (p < 980 || p > 1050) return 'critical';
        if (p < 990 || p > 1040) return 'warning';
        return 'normal';
    };

    const getValueColorStyle = (status) => {
        switch (status) {
            case 'warning': return { color: '#D97706' };
            case 'critical': return { color: '#DC2626' };
            default: return { color: '#16A34A' };
        }
    };

    return (
        <div className="status-card">
            <div className="status-card-header">
                <span className="status-card-title">{(currentDevice?.name || selectedDeviceId) + ' STATUS'}</span>
                <span className={`status-badge ${isConnected ? 'online' : 'offline'}`}>
                    {isConnected ? 'ONLINE' : 'OFFLINE'}
                </span>
            </div>
            <div className="status-row">
                <span className="label">Env Temperature:</span>
                {(() => {
                    const v = getMetricValue('temperature');
                    const status = getTemperatureStatus(v);
                    return <span className="value" style={getValueColorStyle(status)}>{v != null ? `${Number(v).toFixed(0)}°C` : '--°C'}</span>;
                })()}
            </div>
            <div className="status-row">
                <span className="label">Humidity:</span>
                {(() => {
                    const v = getMetricValue('humidity');
                    const status = getHumidityStatus(v);
                    return <span className="value" style={getValueColorStyle(status)}>{v != null ? `${Number(v).toFixed(0)}%` : '--%'}</span>;
                })()}
            </div>
            <div className="status-row">
                <span className="label">Atmp. Pressure:</span>
                {(() => {
                    const v = getMetricValue('pressure');
                    const status = getPressureStatus(v);
                    return <span className="value" style={getValueColorStyle(status)}>{v != null ? `${v} hPa` : '-- hPa'}</span>;
                })()}
            </div>
        </div>
    );
}

// Alerts Card Component
function AlertsCard() {
    const { alerts } = useDevice();

    const activeAlerts = alerts.slice(0, 3);

    return (
        <div className="alerts-card">
            <div className="alerts-header">
                <AlertTriangle size={20} className="text-red-500" />
                <span className="alerts-title">ACTIVE ALERTS</span>
            </div>

            {activeAlerts.length > 0 ? (
                activeAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item ${alert.type}`}>
                        {alert.message}
                    </div>
                ))
            ) : (
                <div className="no-alerts">
                    <div className="no-alerts-icon">
                        <CheckCircle size={24} />
                    </div>
                    <p>No active alerts</p>
                    <p className="text-xs">All systems operating normally</p>
                </div>
            )}
        </div>
    );
}

// Control Toggles Component
function ControlToggles() {
    const { currentDeviceData, selectedDeviceId, refreshDeviceState } = useDevice();
    const state = currentDeviceData?.state || {};
    const [isLoading, setIsLoading] = useState({ ac: false, airPurifier: false });
    const [overrides, setOverrides] = useState({ ac: null, airPurifier: null });

    // Use WebSocket state or override (optimistic)
    const acValue = overrides.ac ?? state.ac_power;
    const airPurifierValue = overrides.airPurifier ?? state.air_purifier;
    const acEnabled = acValue === 'ON' || acValue === 'ACTIVE';
    const airPurifierEnabled = airPurifierValue === 'ON' || airPurifierValue === 'ACTIVE';

    // Read system mode from saved settings (fallback to MANUAL)
    let saved = {};
    try {
        const savedRaw = localStorage.getItem('fabrix_settings');
        if (savedRaw) saved = JSON.parse(savedRaw);
    } catch { /* corrupt settings — use defaults */ }
    const systemMode = (saved.systemMode || 'MANUAL').toUpperCase();
    const isAuto = systemMode === 'AUTOMATIC' || systemMode === 'AUTO';

    const acDisplay = acValue ? (acValue.toString().toUpperCase() === 'ON' || acValue.toString().toUpperCase() === 'ACTIVE' ? 'ON' : acValue) : 'OFF';
    const airPurifierDisplay = airPurifierValue ? (airPurifierValue.toString().toUpperCase() === 'ON' || airPurifierValue.toString().toUpperCase() === 'ACTIVE' ? 'ON' : airPurifierValue) : 'OFF';

    // Handle AC toggle (optimistic)
    const handleACToggle = async () => {
        const desiredOn = !(acValue === 'ON' || acValue === 'ACTIVE');
        const desiredState = desiredOn ? 'ON' : 'OFF';
        setOverrides(prev => ({ ...prev, ac: desiredState }));
        setIsLoading(prev => ({ ...prev, ac: true }));

        try {
            await toggleAC(selectedDeviceId, desiredOn);
            if (refreshDeviceState) await refreshDeviceState();
        } catch (error) {
            console.error('[Dashboard] Failed to toggle AC:', error);
            setOverrides(prev => ({ ...prev, ac: null }));
            alert('Failed to toggle AC. Please try again.');
        } finally {
            setIsLoading(prev => ({ ...prev, ac: false }));
            setTimeout(() => setOverrides(prev => ({ ...prev, ac: null })), 3000);
        }
    };

    // Handle Air Purifier toggle (optimistic)
    const handleAirPurifierToggle = async () => {
        const desiredOn = !(airPurifierValue === 'ON' || airPurifierValue === 'ACTIVE');
        const desiredState = desiredOn ? 'ACTIVE' : 'INACTIVE';
        setOverrides(prev => ({ ...prev, airPurifier: desiredState }));
        setIsLoading(prev => ({ ...prev, airPurifier: true }));

        try {
            await setAirPurifier(selectedDeviceId, desiredState);
            if (refreshDeviceState) await refreshDeviceState();
        } catch (error) {
            console.error('[Dashboard] Failed to toggle Air Purifier:', error);
            setOverrides(prev => ({ ...prev, airPurifier: null }));
            alert('Failed to toggle Air Purifier. Please try again.');
        } finally {
            setIsLoading(prev => ({ ...prev, airPurifier: false }));
            setTimeout(() => setOverrides(prev => ({ ...prev, airPurifier: null })), 3000);
        }
    };

    return (
        <div className="controls-section">
            <div className="control-card">
                <div className="control-label">AIR CONDITION (AC):</div>
                <div className="control-toggle">
                    <span className={`toggle-label ${isAuto ? 'auto' : 'manual'}`}>{isAuto ? 'AUTO' : 'MANUAL'} • {acDisplay}</span>
                    {isLoading.ac ? (
                        <Loader2 size={20} className="animate-spin text-accent" />
                    ) : (
                        <div
                            className={`toggle-switch ${acEnabled ? 'active' : ''} ${isAuto ? 'disabled' : ''}`}
                            onClick={isAuto ? undefined : handleACToggle}
                            style={{ cursor: isAuto ? 'not-allowed' : 'pointer', opacity: isAuto ? 0.6 : 1 }}
                            title={isAuto ? 'Disabled in Automatic mode' : 'Click to toggle AC'}
                        />
                    )}
                </div>
            </div>
            <div className="control-card">
                <div className="control-label">AIR PURIFIER:</div>
                <div className="control-toggle">
                    <span className={`toggle-label ${isAuto ? 'auto' : 'manual'}`}>{isAuto ? 'AUTO' : 'MANUAL'} • {airPurifierDisplay}</span>
                    {isLoading.airPurifier ? (
                        <Loader2 size={20} className="animate-spin text-accent" />
                    ) : (
                        <div
                            className={`toggle-switch ${airPurifierEnabled ? 'active' : ''} ${isAuto ? 'disabled' : ''}`}
                            onClick={isAuto ? undefined : handleAirPurifierToggle}
                            style={{ cursor: isAuto ? 'not-allowed' : 'pointer', opacity: isAuto ? 0.6 : 1 }}
                            title={isAuto ? 'Disabled in Automatic mode' : 'Click to toggle Air Purifier'}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// Notice shown in Manual mode suggesting toggles to enable
function ManualModeNotice() {
    const { currentDeviceData } = useDevice();
    const env = currentDeviceData?.environment || {};

    let saved = {};
    try {
        const savedRaw = localStorage.getItem('fabrix_settings');
        if (savedRaw) saved = JSON.parse(savedRaw);
    } catch { /* corrupt settings — use defaults */ }
    const mode = saved.systemMode || 'MANUAL';
    const thresholds = saved.thresholds || { temperature: { min: 18, max: 28 }, humidity: { min: 30, max: 60 } };

    if (mode !== 'MANUAL') return null;

    const suggestions = [];
    const temp = env.ambient_temp ?? env.temperature ?? env.temp;
    const hum = env.ambient_hum ?? env.humidity ?? env.hum;

    if (temp != null && temp > thresholds.temperature.max) suggestions.push('Air Condition (AC)');
    if (hum != null && (hum > thresholds.humidity.max || hum < thresholds.humidity.min)) suggestions.push('Air Purifier');

    if (suggestions.length === 0) return null;

    return (
        <div className="manual-mode-notice">
            <div className="manual-mode-notice__content">
                <AlertTriangle size={18} className="text-warning-dark" />
                <div>
                    <div className="manual-mode-notice__title">Manual Mode Active</div>
                    <div className="manual-mode-notice__text">Recommended: Turn ON {suggestions.join(' and ')}</div>
                </div>
            </div>
        </div>
    );
}

// Robot Details Section
function RobotDetails() {
    const { currentRobots, fetchRobotTasks } = useDevice();
    const robots = Object.values(currentRobots || {});
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Handle refresh to fetch robot tasks from API
    const handleRefresh = async () => {
        if (!fetchRobotTasks) return;
        setIsRefreshing(true);
        try {
            await fetchRobotTasks();
        } catch (err) {
            console.error('[Dashboard] Failed to refresh robot tasks:', err);
        } finally {
            setIsRefreshing(false);
        }
    };

    // Fetch robot tasks on initial mount (only once)
    const hasFetchedRef = useRef(false);
    useEffect(() => {
        if (fetchRobotTasks && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchRobotTasks();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const getStatusClass = (robot) => {
        // Prefer severity provided by DeviceContext
        const sev = robot.severity;
        if (robot.status?.state === 'OFFLINE') return 'offline';
        // Task just completed — show green "online" status
        if (robot.task?.status === 'Completed' || robot.status?.state === 'READY') return 'online';
        if (sev) {
            if (sev.battery === 'critical' || sev.temp === 'critical') return 'critical';
            if (sev.battery === 'warning' || sev.temp === 'warning') return 'warning';
            return 'online';
        }

        const battery = robot.status?.battery;
        if (!battery) return 'offline';
        if (battery < 30) return 'warning';
        return 'online';
    };

    const getTempClass = (temp) => {
        if (temp == null) return '';
        if (temp > 32) return 'critical';
        if (temp > 28) return 'warning';
        return 'normal';
    };

    const getBatteryColorStyle = (battery) => {
        if (battery == null) return { color: '#111827' };
        if (battery < 15) return { color: '#DC2626' };
        if (battery < 40) return { color: '#7C3AED' };
        return { color: '#16A34A' };
    };

    // Get task status badge styling
    const getTaskStatusBadge = (task, robot) => {
        // No task and robot is READY → show ready-for-assignment badge
        if (!task && robot?.status?.state === 'READY') {
            return (
                <span className="task-status-badge" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                    ✅ Ready for Assignment
                </span>
            );
        }

        if (!task) return null;

        // Phase-based badge (new system)
        const phase = task.phase;
        if (phase && PHASE_LABELS[phase]) {
            const colors = PHASE_COLORS[phase] || { bg: '#F3F4F6', color: '#6B7280' };
            const progress = task.progress;

            return (
                // key forces clean remount (resets CSS transition from 0) whenever task changes
                <div key={task.task_id || task.taskId || String(task.assignedAt) || 'task'} style={{ marginTop: '4px' }}>
                    <span className="task-status-badge" style={{ background: colors.bg, color: colors.color }}>
                        {PHASE_LABELS[phase]}
                    </span>
                    {progress != null && phase !== TASK_PHASES.COMPLETED && phase !== TASK_PHASES.ASSIGNED && (
                        <div className="task-progress-inline">
                            <div className="task-progress-bar">
                                <div style={{ width: `${Math.min(progress, 100)}%`, height: '100%', background: colors.color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                            </div>
                            <span style={{ fontSize: '9px', fontWeight: '600', color: colors.color }}>{progress}%</span>
                        </div>
                    )}
                </div>
            );
        }

        // Legacy fallback (tasks without phase)
        const status = (task.status || task.state || '').toLowerCase();
        let bgColor, textColor, label;

        if (status === 'assigned' || status === 'allocated') {
            bgColor = '#E0E7FF';
            textColor = '#4F46E5';
            label = '📋 Assigned';
        } else if (status === 'completed') {
            bgColor = '#D1FAE5';
            textColor = '#059669';
            label = '✓ Completed — Ready for Assignment';
        } else if (status === 'in progress' || status === 'in_progress' || status === 'active' || status === 'moving') {
            bgColor = '#DBEAFE';
            textColor = '#2563EB';
            label = '⟳ In Progress';
        } else if (status === 'pending' || status === 'queued' || status === 'scheduled') {
            bgColor = '#FEF3C7';
            textColor = '#D97706';
            label = '◷ Pending';
        } else if (status === 'error' || status === 'failed') {
            bgColor = '#FEE2E2';
            textColor = '#DC2626';
            label = '✕ Failed';
        } else if (task.task || task.type) {
            // Has task but no recognized status - show as assigned
            bgColor = '#E0E7FF';
            textColor = '#4F46E5';
            label = '📋 Assigned';
        } else {
            return null;
        }

        return (
            <span className="task-status-badge" style={{ background: bgColor, color: textColor }}>
                {label}
            </span>
        );
    };

    if (robots.length === 0) {
        return (
            <div className="robot-details-section">
                <div className="robot-details-header">
                    <h2 className="robot-details-title">Robot details</h2>
                </div>
                <div className="no-robots-empty">
                    <Bot size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No robots discovered yet</p>
                    <p className="text-xs mt-2">Waiting for robot data from WebSocket...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="robot-details-section">
            <div className="robot-details-header">
                <div className="settings-flex-row">
                    <h2 className="robot-details-title">Robot details</h2>
                    <span className="robot-details-count">{robots.length} robot(s) connected</span>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="robot-refresh-btn"
                    title="Refresh robot tasks from server"
                >
                    {isRefreshing ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : (
                        <RefreshCw size={12} />
                    )}
                    Refresh
                </button>
            </div>

            <div className="robot-cards-grid">
                {robots.map(robot => (
                    <div key={robot.id} className="robot-card">
                        <div className={`robot-card-status ${getStatusClass(robot)}`} />
                        <div className="robot-card-id">
                            {robot.id.replace('robot-', 'R-')}
                        </div>
                        <div className="robot-card-icon">
                            <Bot size={32} />
                        </div>
                        <div className="robot-card-task">
                            {robot.task?.phase === TASK_PHASES.COMPLETED
                                ? <span className="text-success-dark">✅ {robot.task.type || 'Task'} — Delivered</span>
                                : robot.task?.phase
                                    ? <>{PHASE_LABELS[robot.task.phase]?.split(' ').slice(1).join(' ') || robot.task.task || robot.task.type || '--'}</>
                                    : robot.task
                                        ? <>TASK: {robot.task.task || robot.task.type || '--'}</>
                                        : robot.status?.state === 'READY'
                                            ? <span className="text-emerald-700">Ready for Assignment</span>
                                            : 'TASK: --'
                            }
                        </div>
                        {/* Task Status Badge */}
                        {getTaskStatusBadge(robot.task, robot)}
                        <div className="robot-card-stats">
                            <div className={`robot-stat`}>
                                <Battery size={14} />
                                <span style={getBatteryColorStyle(robot.status?.battery)}>{robot.status?.battery ? `${robot.status.battery}%` : '--'}</span>
                            </div>
                            <div className={`robot-stat temp ${getTempClass(robot.environment?.temp)}`}>
                                <Thermometer size={14} />
                                {robot.environment?.temp ? `${robot.environment.temp}°C` : '--°C'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Main Dashboard Component
function Dashboard() {
    const [isMobile, setIsMobile] = useState(false);
    const [showMobileMap, setShowMobileMap] = useState(false);

    useEffect(() => {
        function update() {
            setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 768);
        }
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    // Lock body scroll when mobile map is open
    useEffect(() => {
        if (showMobileMap) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [showMobileMap]);

    return (
        <div className="dashboard-content">
            {/* Mobile Full-Screen Map View */}
            {isMobile && showMobileMap && (
                <div className="mobile-map-view">
                    <div className="mobile-map-view-header">
                        <button
                            className="mobile-map-view-back"
                            onClick={() => setShowMobileMap(false)}
                            aria-label="Back to dashboard"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <span className="mobile-map-view-title">Robot Floor Map</span>
                        <span className="mobile-map-view-hint">Tap robot to inspect</span>
                    </div>
                    <div className="mobile-map-view-content">
                        <FabMap />
                    </div>
                </div>
            )}

            {/* Mobile Layout - Vertical stacking */}
            {isMobile ? (
                <>
                    {/* Status Cards First on Mobile */}
                    <div className="mobile-status-section">
                        <ManualModeNotice />
                        <StatusCard />
                        <ControlToggles />
                    </div>

                    {/* Map Link Card — replaces inline map on mobile */}
                    <button
                        className="mobile-map-link-card"
                        onClick={() => setShowMobileMap(true)}
                        aria-label="View robot floor map"
                    >
                        <div className="mobile-map-link-card__icon">
                            <Map size={26} />
                        </div>
                        <div className="mobile-map-link-card__text">
                            <div className="mobile-map-link-card__title">View Robot Floor Map</div>
                            <div className="mobile-map-link-card__sub">Live robot positions &amp; zone status</div>
                        </div>
                        <ChevronRight size={20} className="mobile-map-link-card__arrow" />
                    </button>

                    {/* Alerts */}
                    <AlertsCard />

                    {/* Robot Details */}
                    <div className="bottom-section">
                        <RobotDetails />
                    </div>
                </>
            ) : (
                /* Desktop Layout - Grid */
                <>
                    <div className="dashboard-grid">
                        {/* Left Column - Map */}
                        <div className="map-column">
                            <FabMap />
                        </div>

                        {/* Right Column - Status & Alerts */}
                        <div className="side-column">
                            <ManualModeNotice />
                            <StatusCard />
                            <AlertsCard />
                            <ControlToggles />
                        </div>
                    </div>

                    <div className="bottom-section">
                        <RobotDetails />
                    </div>
                </>
            )}
        </div>
    );
}

export default Dashboard;
