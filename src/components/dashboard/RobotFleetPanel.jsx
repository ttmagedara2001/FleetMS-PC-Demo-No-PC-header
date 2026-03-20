/**
 * @module RobotFleetPanel
 * @description Displays the robot fleet grid with per-robot health cards.
 * Each card shows battery level, temperature, load, position, task phase,
 * connection status, and collision alerts in real time.
 */
import { useState, useEffect } from 'react';
import {
    Battery,
    Thermometer,
    Package,
    Navigation,
    AlertTriangle,
    CheckCircle,
    Clock,
    Zap,
    RefreshCw,
    RotateCcw,
    Loader2,
    ShieldAlert
} from 'lucide-react';
import { useDevice } from '../../contexts/DeviceContext';
import { PHASE_LABELS, PHASE_COLORS } from '../../utils/telemetryMath';
import {
    getRobotTempStatus,
    getBatteryStatus,
    computeRobotHealthFromSettings
} from '../../utils/thresholds';

function RobotCard({ robot, onReset }) {
    // compute robot health from battery percentage using user-defined thresholds
    const batteryValue = robot.status?.battery ?? robot.status?.battery_pct ?? robot.battery_pct ?? robot.battery;
    const health = computeRobotHealthFromSettings(batteryValue);


    const getTempStatus = () => {
        const temp = robot.environment?.temp;
        return getRobotTempStatus(temp);
    };

    const getStateIcon = () => {
        const state = robot.status?.state;
        switch (state) {
            case 'MOVING':
            case 'ACTIVE':
                return <Navigation size={14} className="text-green-500 animate-pulse" />;
            case 'CHARGING':
                return <Zap size={14} className="text-green-500" />;
            case 'IDLE':
                return <Clock size={14} className="text-gray-400" />;
            case 'ERROR':
                return <AlertTriangle size={14} className="text-red-500" />;
            case 'BLOCKED':
                return <ShieldAlert size={14} className="text-orange-500 animate-pulse" />;
            default:
                return <CheckCircle size={14} className="text-gray-400" />;
        }
    };

    const getStateColor = () => {
        const state = robot.status?.state;
        switch (state) {
            case 'MOVING':
            case 'ACTIVE':
                return 'border-green-500 bg-green-50';
            case 'CHARGING':
                return 'border-green-500 bg-green-50';
            case 'ERROR':
                return 'border-red-500 bg-red-50';
            case 'BLOCKED':
                return 'border-orange-500 bg-orange-50';
            default:
                return 'border-gray-300 bg-white';
        }
    };

    const batteryStatus = health.status;
    const tempStatus = getTempStatus();

    const getDotColor = (severity) => severity === 'critical' ? '#DC2626' : '#16A34A';

    // Determine whether the robot is actively receiving sensor/stream data (fresh lastUpdate).
    // With 5 robots on a 3 s round-robin, each robot gets a WS update roughly every 15 s.
    // Using a 20 s window ensures the dot stays green between cycles.
    const isReceivingData = (() => {
        const last = robot.lastUpdate || 0;
        if (!last) return false;
        const ageMs = Date.now() - last;
        return ageMs < 20000; // 20 s covers the ~15 s round-robin gap
    })();

    // Connection indicator now depends ONLY on recent data receipt: green when receiving, red otherwise
    const getConnectionColor = () => (isReceivingData ? '#16A34A' : '#DC2626');

    const getBatteryTextColor = (status) => {
        if (!status) return '#111827';
        if (status === 'critical') return '#DC2626';
        return '#16A34A';
    };

    return (
        <div className={`card p-0.5 md:p-1 border-l-4 ${getStateColor()}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-0.5 md:mb-1">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 md:w-6 md:h-6 gradient-primary rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-xs">
                            {robot.id.split('-')[1] || robot.id.substring(0, 2)}
                        </span>
                    </div>

                    <div>
                        <h4 className="font-semibold text-primary-700 text-sm">{robot.id}</h4>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            {getStateIcon()}
                            <span>{robot.status?.state || 'Unknown'}</span>
                        </div>
                    </div>
                </div>

                {/* Right-corner connection bulb: depends ONLY on stream data freshness */}
                <div
                    role="status"
                    aria-label={isReceivingData ? 'Receiving data' : 'No recent data'}
                    data-conn={isReceivingData ? 'true' : 'false'}
                    className="fleet-conn-bulb"
                    style={{ backgroundColor: getConnectionColor(), boxShadow: `0 0 6px ${getConnectionColor()}33` }}
                    title={
                        `Connectivity: ${isReceivingData ? 'Receiving' : 'Not receiving'} | ` +
                        (robot.lastUpdate ? `Last update: ${new Date(robot.lastUpdate).toLocaleTimeString()} | ` : '') +
                        `Temp status: ${tempStatus} | Battery: ${batteryStatus}`
                    }
                />

                {/* Alert indicator (keeps showing when battery/temp not normal) */}
                {(batteryStatus !== 'normal' || tempStatus !== 'normal') && (
                    <AlertTriangle
                        size={18}
                        className={`${batteryStatus === 'critical' || tempStatus === 'critical' ? 'text-red-500 animate-pulse' : 'text-primary-600'}`}
                    />
                )}
            </div>

            {/* Collision / Blocked Banner */}
            {robot.status?.state === 'BLOCKED' && (
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg bg-orange-100 border border-orange-300">
                    <ShieldAlert size={14} className="text-orange-600 shrink-0 animate-pulse" />
                    <span className="text-xs font-semibold text-orange-700">
                        Collision risk — Movement paused
                        {robot.status?.blockedBy?.length > 0 && (
                            <span className="font-normal text-orange-600"> (near {robot.status.blockedBy.join(', ')})</span>
                        )}
                    </span>
                </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-0.5 md:gap-1">
                {/* Battery */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Battery size={14} className="text-primary-600" />
                        <span className="text-xs text-gray-500">Battery</span>
                        <span className="fleet-status-dot" style={{ background: getDotColor(batteryStatus) }} title={`Battery: ${health.label}`} />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 progress-bar">
                            <div
                                className={`progress-bar-fill ${batteryStatus}`}
                                style={{ width: `${health.pct}%` }}
                            />
                        </div>
                        <div className="w-10 text-right">
                            <div className="text-sm font-semibold" style={{ color: getBatteryTextColor(batteryStatus) }}>{health.pct}%</div>
                            <div className="text-xs" style={{ color: getBatteryTextColor(batteryStatus) }}>{health.label}</div>
                        </div>
                    </div>
                </div>

                {/* Temperature */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Thermometer size={14} className="text-primary-600" />
                        <span className="text-xs text-gray-500">Temp</span>
                        <span className="fleet-status-dot" style={{ background: getDotColor(tempStatus) }} title={`Temp status: ${tempStatus}`} />
                    </div>
                    <p className="text-sm font-semibold" style={tempStatus === 'critical' ? { color: '#DC2626' } : tempStatus === 'warning' ? { color: '#D97706' } : { color: '#16A34A' }}>
                        {robot.environment?.temp != null ? (robot.environment.temp.toFixed(1)) : '--'}°C
                    </p>
                </div>

                {/* Load Status */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Package size={14} className="text-primary-600" />
                        <span className="text-xs text-gray-500">Load</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                        {robot.status?.load || 'None'}
                    </p>
                </div>

                {/* Position */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Navigation size={14} className="text-primary-600" />
                        <span className="text-xs text-gray-500">Position</span>
                    </div>
                    <p className="text-xs font-medium text-gray-700">
                        {robot.location?.lat?.toFixed(4) || '--'}, {robot.location?.lng?.toFixed(4) || '--'}
                    </p>
                </div>
            </div>

            {/* Task Status */}
            {robot.task && (
                // key forces remount (cleans stale UI) whenever task_id changes
                <div key={robot.task.task_id || robot.task.taskId || String(robot.task.assignedAt) || 'task'}
                    className="mt-0.5 pt-0.5 md:mt-1 md:pt-1 border-t border-gray-100 fleet-task-status">
                    {/* Status indicator */}
                    {(() => {
                        const phase = robot.task.phase || 'ASSIGNED';
                        const isCompleted = phase === 'COMPLETED';
                        const isFailed = phase === 'FAILED';

                        if (isCompleted) {
                            return (
                                <div className="fleet-task-result">
                                    <CheckCircle size={20} className="fleet-task-result--completed" />
                                    <span className="fleet-task-result__label fleet-task-result--completed">
                                        Completed
                                    </span>
                                    {/* Reset button — only on completed/failed tasks */}
                                    <button
                                        onClick={() => onReset && onReset(robot.id)}
                                        title="Reset robot to free state"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginLeft: 'auto',
                                            padding: '3px 10px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            fontFamily: "'Inter', system-ui, sans-serif",
                                            color: '#5530FA',
                                            background: 'rgba(85,48,250,0.08)',
                                            border: '1px solid rgba(85,48,250,0.3)',
                                            borderRadius: '7px',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease',
                                            flexShrink: 0,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(85,48,250,0.18)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(85,48,250,0.08)'}
                                    >
                                        <RotateCcw size={11} />
                                        Free
                                    </button>
                                </div>
                            );
                        }
                        if (isFailed) {
                            return (
                                <div className="fleet-task-result">
                                    <AlertTriangle size={20} className="fleet-task-result--failed" />
                                    <span className="fleet-task-result__label fleet-task-result--failed">
                                        Failed
                                    </span>
                                    {/* Reset button — only on completed/failed tasks */}
                                    <button
                                        onClick={() => onReset && onReset(robot.id)}
                                        title="Reset robot to free state"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginLeft: 'auto',
                                            padding: '3px 10px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            fontFamily: "'Inter', system-ui, sans-serif",
                                            color: '#DC2626',
                                            background: 'rgba(220,38,38,0.07)',
                                            border: '1px solid rgba(220,38,38,0.25)',
                                            borderRadius: '7px',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease',
                                            flexShrink: 0,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.16)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.07)'}
                                    >
                                        <RotateCcw size={11} />
                                        Free
                                    </button>
                                </div>
                            );
                        }

                        const phaseStyle = PHASE_COLORS[phase] || { bg: '#E0E7FF', color: '#4F46E5' };
                        const label = PHASE_LABELS[phase] || phase;
                        return (
                            <span
                                className="fleet-phase-badge"
                                style={{ background: phaseStyle.bg, color: phaseStyle.color }}
                            >
                                {label}
                            </span>
                        );
                    })()}
                    {(robot.task['initiate location'] || robot.task.source) && robot.task.destination && (
                        <span className="text-gray-500 text-xs fleet-task-route">
                            {robot.task['initiate location'] || robot.task.source} → {robot.task.destination}
                        </span>
                    )}
                    <span className="text-gray-400 fleet-task-id">
                        {robot.task.task_id || robot.task.taskId || ''}
                    </span>
                </div>
            )}
        </div>
    );
}

function RobotFleetPanel() {
    const { currentRobots, fetchRobotTasks, resetRobot } = useDevice();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const robots = Object.values(currentRobots || {});

    // Fetch robot tasks on initial mount to ensure task data is loaded on refresh
    useEffect(() => {
        if (fetchRobotTasks) {
            fetchRobotTasks();
        }
    }, [fetchRobotTasks]);

    // Handle manual refresh
    const handleRefresh = async () => {
        if (!fetchRobotTasks) return;
        setIsRefreshing(true);
        try {
            await fetchRobotTasks();
        } catch (err) {
            console.error('[RobotFleetPanel] Failed to refresh robot tasks:', err);
        } finally {
            setIsRefreshing(false);
        }
    };

    const stats = {
        total: robots.length,
        active: robots.filter(r => r.status?.state === 'MOVING' || r.status?.state === 'ACTIVE').length,
        charging: robots.filter(r => r.status?.state === 'CHARGING').length,
        error: robots.filter(r => r.status?.state === 'ERROR').length
    };

    return (
        <div className="space-y-1 md:space-y-2">
            {/* Header with Stats */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">Robot Fleet</h3>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Refresh robot tasks"
                    >
                        {isRefreshing ? (
                            <Loader2 size={14} className="animate-spin text-primary-600" />
                        ) : (
                            <RefreshCw size={14} className="text-gray-500 hover:text-primary-600" />
                        )}
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <span className="bg-accent-gold-light text-primary-700 rounded-full px-3 py-1 text-xs font-medium">{robots.length} robot(s) connected</span>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            Active: {stats.active}
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            Charging: {stats.charging}
                        </span>
                        {stats.error > 0 && (
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                Error: {stats.error}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Robot Cards Grid */}
            {robots.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-1 md:gap-2">
                    {robots.map(robot => (
                        <RobotCard key={robot.id} robot={robot} onReset={resetRobot} />
                    ))}
                </div>
            ) : (
                <div className="card p-1 md:p-3 text-center">
                    <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                        <Package size={24} className="text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">No robots discovered yet</p>
                    <p className="text-gray-400 text-xs mt-1">Waiting for robot registration...</p>
                </div>
            )}
        </div>
    );
}

export default RobotFleetPanel;
