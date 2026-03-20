/**
 * @module FabMap
 * @description Interactive SVG map of the fabrication floor showing robot positions,
 * zone outlines, task routes, and connection status in real time.
 * Supports desktop full-map and mobile compact views.
 */
import { useState, useEffect, useMemo } from 'react';
import { useDevice } from '../../contexts/DeviceContext';
import { gpsToPercent, ROOM_CENTERS, resolveRoom } from '../../utils/telemetryMath';

// ── Map constants ──
const MAP_WIDTH = 750;
const MAP_HEIGHT = 500;

/** Convert GPS lat/lng → SVG pixel coordinates (aligned with telemetryMath rooms). */
function gpsToSvg(lat, lng) {
    const { xPercent, yPercent } = gpsToPercent(lat, lng);
    return {
        x: (xPercent / 100) * MAP_WIDTH,
        y: (yPercent / 100) * MAP_HEIGHT,
    };
}

// Zone positions derived from telemetryMath ROOMS (percentage → SVG pixels)
// This ensures room geofencing and map rendering are perfectly aligned.
const ZONES = [
    { id: 'cleanroom-a', name: 'Cleanroom A', x: 0.05 * MAP_WIDTH, y: 0.05 * MAP_HEIGHT, width: 0.35 * MAP_WIDTH, height: 0.40 * MAP_HEIGHT, type: 'cleanroom' },
    { id: 'cleanroom-b', name: 'Cleanroom B', x: 0.45 * MAP_WIDTH, y: 0.05 * MAP_HEIGHT, width: 0.30 * MAP_WIDTH, height: 0.40 * MAP_HEIGHT, type: 'cleanroom' },
    { id: 'loading-bay', name: 'Loading Bay',  x: 0.05 * MAP_WIDTH, y: 0.55 * MAP_HEIGHT, width: 0.25 * MAP_WIDTH, height: 0.35 * MAP_HEIGHT, type: 'loading' },
    { id: 'storage',     name: 'Storage',      x: 0.35 * MAP_WIDTH, y: 0.55 * MAP_HEIGHT, width: 0.25 * MAP_WIDTH, height: 0.35 * MAP_HEIGHT, type: 'storage' },
    { id: 'maintenance', name: 'Maintenance',  x: 0.65 * MAP_WIDTH, y: 0.55 * MAP_HEIGHT, width: 0.25 * MAP_WIDTH, height: 0.25 * MAP_HEIGHT, type: 'storage' },
];

// Aisles between zones (horizontal corridor between top and bottom rows)
const AISLES = [
    { id: 'aisle-h', points: `${0.05 * MAP_WIDTH},${0.48 * MAP_HEIGHT} ${0.90 * MAP_WIDTH},${0.48 * MAP_HEIGHT}`, name: 'Main Corridor', isHorizontal: true },
    { id: 'aisle-v', points: `${0.40 * MAP_WIDTH},${0.05 * MAP_HEIGHT} ${0.40 * MAP_WIDTH},${0.90 * MAP_HEIGHT}`, name: 'Vertical Aisle', isVertical: true },
];

function RobotMarker({ robot, isSelected, onClick, markerSize = 18 }) {
    const getBatteryColor = () => {
        const battery = robot.status?.battery;
        if (!battery && battery !== 0) return 'gray';
        if (battery > 60) return 'green';
        if (battery > 30) return 'primary';
        return 'red';
    };

    // Convert GPS lat/lng to SVG pixel coordinates via gpsToPercent
    const hasGps = robot.location?.lat != null && robot.location?.lng != null;
    const pos = hasGps
        ? gpsToSvg(robot.location.lat, robot.location.lng)
        : { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }; // center fallback
    const x = pos.x;
    const y = pos.y;
    const heading = robot.heading || 0;

    return (
        <g
            transform={`translate(${x}, ${y})`}
            onClick={onClick}
            style={{ cursor: 'pointer' }}
            className="robot-marker-group"
        >
            {/* Selection ring */}
            {isSelected && (
                <circle
                    r={markerSize + 10}
                    fill="none"
                    stroke="#9333ea"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    className="animate-spin-slow"
                />
            )}

            {/* Robot body */}
            <circle
                        r={markerSize}
                        className="fill-primary-600"
                stroke="white"
                strokeWidth={markerSize > 14 ? 3 : 2}
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
            />

            {/* Heading indicator */}
            <line
                x1="0"
                y1="0"
                x2="0"
                y2={-markerSize - 7}
                stroke="#9333ea"
                strokeWidth={markerSize > 14 ? 3 : 2}
                markerEnd="url(#arrowhead)"
                transform={`rotate(${heading})`}
            />

            {/* Robot ID */}
            <text
                y={markerSize > 14 ? 6 : 5}
                textAnchor="middle"
                className="text-xs font-bold fill-white"
                style={{ fontSize: markerSize > 14 ? '11px' : '9px' }}
            >
                {robot.id.split('-')[1] || robot.id.substring(0, 3)}
            </text>

            {/* Status indicator */}
            <circle
                cx={Math.max(8, Math.floor(markerSize * 0.7))}
                cy={-Math.max(8, Math.floor(markerSize * 0.7))}
                r={markerSize > 14 ? 5 : 4}
                // Status dot: green while data is fresh, red on error, gray otherwise.
                // 20 s window matches the ~15 s round-robin gap (5 robots × 3 s tick).
                fill={(function() {
                    const last = robot.lastUpdate || 0;
                    const justUpdated = Date.now() - last < 20000; // 20 s covers the round-robin cycle
                    if (justUpdated) return '#22c55e'; // green — recently received data
                    const state = robot.status?.state;
                    if (state === 'ERROR' || state === 'STOPPED') return '#ef4444'; // red for errors
                    return '#9ca3af'; // neutral gray when no recent update
                })()}
                stroke="white"
                strokeWidth={1.5}
            />

            {/* Battery indicator (small bar) */}
            <rect
                x={-Math.max(6, Math.floor(markerSize * 0.6))}
                y={markerSize + 6}
                width={Math.max(12, Math.floor(markerSize * 1.2))}
                height={markerSize > 14 ? 5 : 4}
                rx="2"
                fill="#e5e7eb"
            />
            <rect
                x={-Math.max(6, Math.floor(markerSize * 0.6))}
                y={markerSize + 6}
                width={`${Math.max(12, Math.floor(markerSize * 1.2)) * ((robot.status?.battery || 0) / 100)}`}
                height={markerSize > 14 ? 5 : 4}
                rx="2"
                fill={getBatteryColor() === 'green' ? '#22c55e' : getBatteryColor() === 'primary' ? '#7C3AED' : '#ef4444'}
            />
        </g>
    );
}

function ZoneComponent({ zone }) {
    const getZoneClass = () => {
        switch (zone.type) {
            case 'cleanroom': return 'fill-primary-100 stroke-primary-300';
            case 'loading': return 'fill-green-100 stroke-green-300';
            case 'storage': return 'fill-green-100 stroke-green-300';
            default: return 'fill-gray-100 stroke-gray-300';
        }
    };

    return (
        <g>
            <rect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx="8"
                className={`${getZoneClass()} fill-opacity-60`}
                strokeWidth="2"
                strokeDasharray="8 4"
            />
            <text
                x={zone.x + zone.width / 2}
                y={zone.y + 20}
                textAnchor="middle"
                className="text-xs font-semibold fill-gray-600"
                style={{ fontSize: '12px' }}
            >
                {zone.name}
            </text>
        </g>
    );
}

function FabMap() {
    const { currentRobots, selectedDeviceId, currentDeviceData } = useDevice();
    const [selectedRobotId, setSelectedRobotId] = useState(null);
    const [mapDimensions] = useState({ width: MAP_WIDTH, height: MAP_HEIGHT });
    const [isMobile, setIsMobile] = useState(false);
    const [isPortrait, setIsPortrait] = useState(false);

    const robots = useMemo(() => {
        return Object.values(currentRobots || {});
    }, [currentRobots]);

    const selectedRobot = selectedRobotId ? currentRobots[selectedRobotId] : null;

    useEffect(() => {
        function updateDims() {
            setIsMobile(window.innerWidth <= 768);
            setIsPortrait(window.innerHeight > window.innerWidth);
        }
        updateDims();
        window.addEventListener('resize', updateDims);
        window.addEventListener('orientationchange', updateDims);
        return () => {
            window.removeEventListener('resize', updateDims);
            window.removeEventListener('orientationchange', updateDims);
        };
    }, []);

    // Determine which configured zone a robot belongs to
    function getZoneForRobot(robot) {
        if (!robot?.location?.lat || !robot?.location?.lng) return null;
        const { x, y } = gpsToSvg(robot.location.lat, robot.location.lng);
        for (const zone of ZONES) {
            if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) {
                return zone;
            }
        }
        return null;
    }

    // Lightweight mini-grid that mirrors the main map in a compact view
    function MiniGrid({ robot }) {
        const miniW = 200;
        const miniH = 140;
        const scaleX = miniW / mapDimensions.width;
        const scaleY = miniH / mapDimensions.height;
        const zone = getZoneForRobot(robot);

        const robotPos = (robot?.location?.lat != null && robot?.location?.lng != null)
            ? gpsToSvg(robot.location.lat, robot.location.lng)
            : null;
        const robotX = robotPos?.x ?? null;
        const robotY = robotPos?.y ?? null;

        return (
            <div className="mini-grid">
                <svg viewBox={`0 0 ${miniW} ${miniH}`} width={miniW} height={miniH}>
                            <rect x="0" y="0" width={miniW} height={miniH} rx="6" fill="#ffffff" stroke="#d1d5db" />
                    {/* zones */}
                    {ZONES.map(z => (
                        <rect
                            key={z.id}
                            x={z.x * scaleX}
                            y={z.y * scaleY}
                            width={z.width * scaleX}
                            height={z.height * scaleY}
                            rx={4}
                            fill={z.type === 'cleanroom' ? '#f3e8ff' : z.type === 'loading' ? '#ecfccb' : '#fff7ed'}
                            stroke="#c7c7cc"
                            opacity={0.95}
                        />
                    ))}

                    {/* robot marker */}
                    {robot && robotX != null && robotY != null && (
                        <g>
                            <circle
                                cx={robotX * scaleX}
                                cy={robotY * scaleY}
                                r={8}
                                fill="#6b21a8"
                                stroke="#fff"
                                strokeWidth={1.5}
                            />
                            <text x={robotX * scaleX + 10} y={robotY * scaleY + 6} fontSize={10} fontWeight={700} fill="#111827">{zone ? zone.name : 'Unknown'}</text>
                        </g>
                    )}
                </svg>
            </div>
        );
    }

    // Mobile compact view: show a lightweight overview + selectable robot list
    if (isMobile || (typeof window !== 'undefined' && window.innerWidth <= 768)) {
        return (
            <div className="card p-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900">Fab Overview</h3>
                        <p className="text-sm text-gray-500">{robots.length} robot{robots.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-xs text-gray-500">Mobile view</div>
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto py-1">
                    {robots.map(r => {
                        const fresh = Date.now() - (r.lastUpdate || 0) < 3000; // 3s freshness
                        return (
                            <button
                                key={r.id}
                                onClick={() => setSelectedRobotId(r.id === selectedRobotId ? null : r.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${r.id === selectedRobotId ? 'ring-2 ring-purple-300' : 'bg-white'}`}
                            >
                                <span style={{ width: 10, height: 10, borderRadius: 6, background: fresh ? '#16A34A' : '#DC2626' }} />
                                <span className="text-sm font-semibold">{r.id.split('-')[1] || r.id.substring(0, 3)}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                    <MiniGrid robot={selectedRobot || robots[0]} />

                    <div className="flex items-center justify-between text-sm text-gray-700">
                        <div>
                            <div className="text-xs text-gray-500">Ambient Temp</div>
                            <div className="font-medium">{(currentDeviceData?.environment?.ambient_temp ?? currentDeviceData?.environment?.temperature ?? currentDeviceData?.environment?.temp) != null ? (currentDeviceData.environment.ambient_temp ?? currentDeviceData.environment.temperature ?? currentDeviceData.environment.temp) + '°C' : '--°C'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Humidity</div>
                            <div className="font-medium">{(currentDeviceData?.environment?.ambient_hum ?? currentDeviceData?.environment?.humidity) != null ? (currentDeviceData.environment.ambient_hum ?? currentDeviceData.environment.humidity) + '%' : '--%'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Pressure</div>
                            <div className="font-medium">{(currentDeviceData?.environment?.atmospheric_pressure ?? currentDeviceData?.environment?.pressure) != null ? (currentDeviceData.environment.atmospheric_pressure ?? currentDeviceData.environment.pressure) + ' hPa' : '--'}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card overflow-hidden">
            {/* Map Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-gray-900">Fab Floor Map</h3>
                    <p className="text-sm text-gray-500">
                        {robots.length} robot{robots.length !== 1 ? 's' : ''} active
                    </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-primary-100 border-2 border-primary-300" />
                        <span>Cleanroom</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-green-200 border-2 border-green-400" />
                        <span>Loading</span>
                    </div>
                    <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-amber-200 border-2 border-amber-400" />
                        <span>Storage</span>
                    </div>
                </div>
            </div>

            {/* SVG Map */}
            <div className="relative bg-linear-to-br from-gray-50 to-gray-100">
                {!(isMobile && isPortrait) ? (
                    <svg
                        viewBox={`0 0 ${mapDimensions.width} ${mapDimensions.height}`}
                        className="w-full"
                        style={{ height: isMobile ? '320px' : '400px' }}
                    >
                        {/* Defs */}
                        <defs>
                            <marker
                                id="arrowhead"
                                markerWidth="6"
                                markerHeight="6"
                                refX="3"
                                refY="3"
                                orient="auto"
                            >
                                <polygon
                                    points="0,0 6,3 0,6"
                                    fill="#9333ea"
                                />
                            </marker>
                            <pattern
                                id="grid"
                                width="40"
                                height="40"
                                patternUnits="userSpaceOnUse"
                            >
                                <path
                                    d="M 40 0 L 0 0 0 40"
                                    fill="none"
                                    stroke={isMobile ? '#d1d5db' : '#e5e7eb'}
                                    strokeWidth={isMobile ? 0.8 : 0.5}
                                />
                            </pattern>
                        </defs>

                        {/* Grid background */}
                        <rect width="100%" height="100%" fill="url(#grid)" />

                        {/* Zones */}
                        {ZONES.map(zone => (
                            <ZoneComponent key={zone.id} zone={zone} />
                        ))}

                        {/* Aisles */}
                        {AISLES.map(aisle => (
                            <path
                                key={aisle.id}
                                d={aisle.isHorizontal
                                    ? `M ${aisle.points.split(' ')[0]} L ${aisle.points.split(' ')[1]}`
                                    : aisle.isVertical
                                        ? `M ${aisle.points.split(' ')[0]} L ${aisle.points.split(' ')[1]}`
                                        : `M ${aisle.points}`
                                }
                                stroke="#9ca3af"
                                strokeWidth="20"
                                strokeLinecap="round"
                                fill="none"
                                opacity="0.3"
                            />
                        ))}

                        {/* Task routes — source→destination dotted lines */}
                        {robots.map(robot => {
                            if (!robot.task) return null;
                            const srcName = robot.task['initiate location'] || robot.task.source_name;
                            const dstName = robot.task.destination || robot.task.destination_name;
                            if (!srcName && !dstName) return null;

                            // Resolve room GPS centers
                            const srcResolved = srcName ? resolveRoom(srcName) : null;
                            const dstResolved = dstName ? resolveRoom(dstName) : null;
                            const srcCenter = srcResolved?.room?.center;
                            const dstCenter = dstResolved?.room?.center;

                            // Robot current position
                            const hasGps = robot.location?.lat != null && robot.location?.lng != null;
                            const robotSvg = hasGps ? gpsToSvg(robot.location.lat, robot.location.lng) : null;

                            // Source and destination SVG positions
                            const srcSvg = srcCenter ? gpsToSvg(srcCenter.lat, srcCenter.lng) : null;
                            const dstSvg = dstCenter ? gpsToSvg(dstCenter.lat, dstCenter.lng) : null;

                            const segments = [];
                            // Faint full route: source → destination
                            if (srcSvg && dstSvg) {
                                segments.push(
                                    <path
                                        key={`full-route-${robot.id}`}
                                        d={`M ${srcSvg.x} ${srcSvg.y} L ${dstSvg.x} ${dstSvg.y}`}
                                        stroke="#9333ea"
                                        strokeWidth="1.5"
                                        strokeDasharray="4 6"
                                        fill="none"
                                        opacity="0.3"
                                    />
                                );
                            }
                            // Active leg: robot → current target
                            if (robotSvg) {
                                const targetSvg = (robot.task.phase === 'EN_ROUTE_TO_SOURCE' || robot.task.phase === 'ASSIGNED')
                                    ? srcSvg : dstSvg;
                                if (targetSvg) {
                                    segments.push(
                                        <path
                                            key={`active-route-${robot.id}`}
                                            d={`M ${robotSvg.x} ${robotSvg.y} L ${targetSvg.x} ${targetSvg.y}`}
                                            stroke="#9333ea"
                                            strokeWidth="2"
                                            strokeDasharray="6 4"
                                            fill="none"
                                            opacity="0.6"
                                        />
                                    );
                                }
                            }
                            // Source marker (small circle)
                            if (srcSvg) {
                                segments.push(
                                    <circle key={`src-${robot.id}`} cx={srcSvg.x} cy={srcSvg.y} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} opacity={0.8} />
                                );
                            }
                            // Destination marker (small diamond)
                            if (dstSvg) {
                                segments.push(
                                    <rect key={`dst-${robot.id}`} x={dstSvg.x - 5} y={dstSvg.y - 5} width={10} height={10} rx={2}
                                        fill="#ef4444" stroke="#fff" strokeWidth={1.5} opacity={0.8}
                                        transform={`rotate(45, ${dstSvg.x}, ${dstSvg.y})`} />
                                );
                            }
                            return <g key={`route-group-${robot.id}`}>{segments}</g>;
                        })}

                        {/* Robots */}
                        {robots.map(robot => (
                            <RobotMarker
                                key={robot.id}
                                robot={robot}
                                isSelected={robot.id === selectedRobotId}
                                onClick={() => setSelectedRobotId(robot.id === selectedRobotId ? null : robot.id)}
                                markerSize={isMobile ? 14 : 18}
                            />
                        ))}
                    </svg>
                ) : (
                    <div className="portrait-summary p-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900">Fab Overview</h4>
                            <span className="text-sm text-gray-500">{robots.length} robot{robots.length !== 1 ? 's' : ''}</span>
                        </div>

                        <div className="flex items-start gap-3 mt-3">
                            <MiniGrid robot={selectedRobot || robots[0]} />
                            <div className="flex-1 text-sm">
                                {selectedRobot ? (
                                    <div className="space-y-2">
                                        <div className="font-medium">{selectedRobot.id}</div>
                                        <div className="text-gray-500">Status: {selectedRobot.status?.state || 'Unknown'}</div>
                                        <div className="text-gray-500">Battery: {selectedRobot.status?.battery ?? '--'}%</div>
                                        <div className="text-gray-500">Temp: {selectedRobot.environment?.temp ?? '--'}°C</div>
                                    </div>
                                ) : (
                                    <div className="text-gray-500">Tap a robot on the map to see details</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Robot Info Overlay */}
                {selectedRobot && (
                    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 min-w-50 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">{selectedRobot.id}</h4>
                            <button
                                onClick={() => setSelectedRobotId(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ×
                            </button>
                        </div>
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Status</span>
                                <span className="font-medium">{selectedRobot.status?.state || 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Battery</span>
                                <span className="font-medium">{selectedRobot.status?.battery || '--'}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Load</span>
                                <span className="font-medium">{selectedRobot.status?.load || 'None'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Temperature</span>
                                <span className="font-medium">{selectedRobot.environment?.temp || '--'}°C</span>
                            </div>
                            {selectedRobot.task && (
                                <div className="pt-2 border-t border-gray-100">
                                    <p className="text-xs text-gray-400">Current Task</p>
                                    <p className="font-medium text-primary-600 text-xs">
                                        {selectedRobot.task.task_type || selectedRobot.task.type || 'Deliver'}: {selectedRobot.task['initiate location'] || selectedRobot.task.source_name || '?'} → {selectedRobot.task.destination || selectedRobot.task.destination_name || '?'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* Mini-grid overlay for mobile: shows robot location and zone */}
                {isMobile && (
                    <div className="absolute bottom-4 right-4">
                        <MiniGrid robot={selectedRobot || robots[0]} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default FabMap;
