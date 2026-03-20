/**
 * AlertsPanel — Displays active critical and warning alerts.
 *
 * Renders a scrollable list with dismiss and clear-all actions.
 * Alerts are sourced from the DeviceContext.
 *
 * @module AlertsPanel
 */
import { AlertTriangle, Bell, X, CheckCircle } from 'lucide-react';
import { useDevice } from '../../contexts/DeviceContext';

function AlertsPanel() {
    const { alerts, clearAlert, clearAllAlerts } = useDevice();

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    
    };

    const criticalAlerts = alerts.filter(a => a.type === 'critical');
    const warningAlerts = alerts.filter(a => a.type === 'warning');

    return (
        <div className="card">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bell size={18} className="text-primary-600" />
                    <h3 className="font-semibold text-gray-900">Active Alerts</h3>
                    {alerts.length > 0 && (
                        <span className={`badge ${criticalAlerts.length > 0 ? 'badge-critical' : 'badge-warning'}`}>
                            {alerts.length}
                        </span>
                    )}
                </div>
                {alerts.length > 0 && (
                    <button
                        onClick={clearAllAlerts}
                        className="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                    >
                        Clear all
                    </button>
                )}
            </div>

            {/* Alerts List */}
            <div className="p-4 max-h-75 overflow-y-auto">
                {alerts.length > 0 ? (
                    <div className="space-y-2">
                        {alerts.slice(0, 10).map(alert => (
                            <div
                                key={alert.id}
                                className={`alert-item ${alert.type} flex items-start justify-between gap-2`}
                            >
                                <div className="flex items-start gap-2">
                                    <AlertTriangle
                                        size={16}
                                        className={`mt-0.5 shrink-0 ${alert.type === 'critical' ? 'text-red-500' : 'text-amber-500'}`}
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                            <span>{alert.deviceId}</span>
                                            {alert.robotId && <span>• {alert.robotId}</span>}
                                            <span>• {formatTimestamp(alert.timestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => clearAlert(alert.id)}
                                    className="p-1 hover:bg-white rounded transition-colors shrink-0"
                                >
                                    <X size={14} className="text-gray-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle size={24} className="text-green-500" />
                        </div>
                        <p className="text-gray-500 text-sm">No active alerts</p>
                        <p className="text-gray-400 text-xs mt-1">All systems operating normally</p>
                    </div>
                )}
            </div>

            {/* Summary Footer */}
            {alerts.length > 0 && (
                <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                        {criticalAlerts.length > 0 && (
                            <span className="text-red-600 font-medium">
                                {criticalAlerts.length} Critical
                            </span>
                        )}
                        {warningAlerts.length > 0 && (
                            <span className="text-amber-600 font-medium">
                                {warningAlerts.length} Warning
                            </span>
                        )}
                    </div>
                    {alerts.length > 10 && (
                        <span className="text-gray-500">
                            Showing 10 of {alerts.length}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default AlertsPanel;
