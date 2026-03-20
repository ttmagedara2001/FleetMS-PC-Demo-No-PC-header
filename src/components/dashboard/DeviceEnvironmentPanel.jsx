/**
 * DeviceEnvironmentPanel — Ambient environment metrics display.
 *
 * Shows temperature, humidity, pressure, and device state (AC, purifier,
 * gateway health) with color-coded severity indicators.
 *
 * @module DeviceEnvironmentPanel
 */
import {
    Thermometer,
    Droplets,
    Gauge,
    Wind,
    Wifi,
    Power,
    AlertTriangle,
    Activity
} from 'lucide-react';
import { useDevice } from '../../contexts/DeviceContext';
import {
    getTemperatureStatus,
    getHumidityStatus,
    getPressureStatus
} from '../../utils/thresholds';

function MetricCard({ icon: Icon, label, value, unit, status = 'normal', trend }) {
    const getStatusColor = () => {
        switch (status) {
            case 'warning': return 'text-primary-500 bg-primary-50 border-primary-200';
            case 'critical': return 'text-red-500 bg-red-50 border-red-200';
            default: return 'text-green-500 bg-green-50 border-green-200';
        }
    };

    const getIconBg = () => {
        switch (status) {
            case 'warning': return 'bg-primary-100 text-primary-600';
            case 'critical': return 'bg-red-100 text-red-600';
            default: return 'bg-primary-100 text-primary-600';
        }
    };

    /** Returns inline color style for the metric value. */
    const getValueColorStyle = () => {
        switch (status) {
            case 'warning': return { color: '#7C3AED' };
            case 'critical': return { color: '#DC2626' };
            default: return { color: '#16A34A' };
        }
    };

    return (
        <div className={`card p-4 border-l-4 ${getStatusColor()}`}>
            <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${getIconBg()}`}>
                    <Icon size={20} />
                </div>
                {status !== 'normal' && (
                    <span className={`status-dot ${status}`} />
                )}
            </div>
            <div className="mt-3">
                <p className="text-sm text-gray-500">{label}</p>
                <div className="flex items-baseline gap-1 mt-1">
                    <span
                        className="text-2xl font-bold"
                        style={value == null || value === '--' ? { color: '#111827' } : getValueColorStyle()}
                    >
                        {value ?? '--'}
                    </span>
                    {unit && <span className="text-sm text-gray-500">{unit}</span>}
                </div>
                {trend && (
                    <p className={`text-xs mt-1 ${trend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% from last hour
                    </p>
                )}
            </div>
        </div>
    );
}

function StatusCard({ icon: Icon, label, value, isActive }) {
    return (
        <div className={`card p-4 ${isActive ? 'border-green-500 border-2' : ''}`}>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    <Icon size={20} />
                </div>
                <div>
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className={`font-semibold ${isActive ? 'text-green-600' : 'text-gray-600'}`}>
                        {value}
                    </p>
                </div>
            </div>
        </div>
    );
}

function DeviceEnvironmentPanel() {
    const { currentDeviceData, currentDevice, isConnected } = useDevice();

    const env = currentDeviceData?.environment || {};
    const state = currentDeviceData?.state || {};

    const getRssiStatus = (rssi) => {
        if (!rssi) return 'normal';
        if (rssi < -70) return 'critical';
        if (rssi < -60) return 'warning';
        return 'normal';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Device Environment</h2>
                    <p className="text-sm text-gray-500">
                        {currentDevice?.name} • {currentDevice?.zone}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`status-dot ${isConnected ? 'normal' : 'critical'}`} />
                    <span className="text-sm text-gray-500">
                        {isConnected ? 'Live' : 'Disconnected'}
                    </span>
                </div>
            </div>

            {/* Environment Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    icon={Thermometer}
                    label="Ambient Temperature"
                    value={env.ambient_temp?.toFixed(1)}
                    unit="°C"
                    status={getTemperatureStatus(env.ambient_temp)}
                />
                <MetricCard
                    icon={Droplets}
                    label="Humidity"
                    value={env.ambient_hum?.toFixed(1)}
                    unit="%"
                    status={getHumidityStatus(env.ambient_hum)}
                />
                <MetricCard
                    icon={Gauge}
                    label="Atmospheric Pressure"
                    value={env.atmospheric_pressure?.toFixed(0)}
                    unit="hPa"
                    status={getPressureStatus(env.atmospheric_pressure)}
                />
                <MetricCard
                    icon={Wind}
                    label="Air Purifier"
                    value={state.air_purifier || '--'}
                    status={state.air_purifier === 'ON' || state.air_purifier === 'ACTIVE' ? 'normal' : 'warning'}
                />
            </div>

            {/* Device State Grid */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">System Status</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatusCard
                        icon={Activity}
                        label="Gateway Health"
                        value={state.gateway_health || state.status || 'Unknown'}
                        isActive={state.gateway_health === 'NOMINAL' || state.status === 'ONLINE' || state.status === 'OK'}
                    />
                    <StatusCard
                        icon={Power}
                        label="AC Power"
                        value={state.ac_power || 'Unknown'}
                        isActive={state.ac_power === 'ON' || state.ac_power === 'ACTIVE'}
                    />
                    <StatusCard
                        icon={Wifi}
                        label="WiFi Signal"
                        value={state.wifi_rssi ? `${state.wifi_rssi} dBm` : 'Unknown'}
                        isActive={state.wifi_rssi && state.wifi_rssi > -60}
                    />
                    <StatusCard
                        icon={AlertTriangle}
                        label="Active Alert"
                        value={state.active_alert || 'None'}
                        isActive={!state.active_alert}
                    />
                </div>
            </div>
        </div>
    );
}

export default DeviceEnvironmentPanel;
