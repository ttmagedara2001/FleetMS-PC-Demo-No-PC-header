/**
 * Sidebar — Navigation, user profile, and emergency controls.
 *
 * Provides tab navigation (Dashboard, Analysis, Settings),
 * a collapsible sidebar toggle, and the emergency stop button.
 *
 * @module Sidebar
 */
import { useState } from 'react';
import {
    LayoutDashboard,
    BarChart3,
    Settings,
    User,
    StopCircle,
    RefreshCw,
    Eye,
    EyeOff
} from 'lucide-react';
import { useDevice } from '../../contexts/DeviceContext';
import { useApi } from '../../hooks/useApi';

function Sidebar({ activeTab, setActiveTab, isOpen, onClose }) {
    const { selectedDeviceId } = useDevice();
    const { emergencyStop, emergencyClear } = useApi();
    const [isEmergencyLoading, setIsEmergencyLoading] = useState(false);
    const [isStopped, setIsStopped] = useState(false);
    const [hideContent, setHideContent] = useState(() => {
        try {
            const raw = localStorage.getItem('sidebar_hide_content');
            return raw === 'true';
        } catch (e) { return false; }
    });

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'analysis', label: 'Analysis', icon: BarChart3 },
        { id: 'settings', label: 'Settings', icon: Settings }
    ];

    const handleEmergencyStop = async () => {
        setIsEmergencyLoading(true);
        try {
            await emergencyStop(selectedDeviceId);
            setIsStopped(true);
        } catch (error) {
            console.error('[Sidebar] Emergency stop failed:', error);
        } finally {
            setIsEmergencyLoading(false);
        }
    };

    const handleRestart = () => {
        setIsEmergencyLoading(true);
        emergencyClear(selectedDeviceId)
            .catch((err) => {
                console.error('[Sidebar] Failed to clear emergency:', err);
            })
            .finally(() => {
                setIsEmergencyLoading(false);
                window.location.reload();
            });
    };

    return (
        <>
            {/* Mobile Backdrop Overlay */}
            {isOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={onClose}
                    style={{
                        opacity: isOpen ? 1 : 0,
                        pointerEvents: isOpen ? 'auto' : 'none'
                    }}
                />
            )}

            <aside className={`sidebar ${isOpen ? 'open' : ''} ${hideContent ? 'collapsed' : ''}`}>
                {/* User Profile */}
                <div className="sidebar-user">
                    <div className="sidebar-user-avatar">
                        <User size={20} />
                    </div>
                    <div className="sidebar-user-info">
                        <h4>WELCOME!</h4>
                        <p>USER1233</p>
                    </div>
                    <button
                        className="sidebar-hide-toggle"
                        onClick={() => {
                            const next = !hideContent;
                            setHideContent(next);
                            try { localStorage.setItem('sidebar_hide_content', String(next)); } catch (e) {}
                        }}
                        title={hideContent ? 'Show sidebar content' : 'Hide sidebar content'}
                    >
                        {hideContent ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    onClose();
                                }}
                                className={`nav-item ${isActive ? 'active' : ''}`}
                            >
                                <Icon size={20} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Emergency Stop Section */}
                <div className="emergency-section">
                    <p className="emergency-warning">
                        Stops all active machinery immediately. Use only in EMERGENCIES
                    </p>
                    <button
                        onClick={isStopped ? handleRestart : handleEmergencyStop}
                        disabled={isEmergencyLoading}
                        className={`emergency-btn ${isStopped ? 'restart' : ''}`}
                    >
                        {isStopped ? <RefreshCw size={18} /> : <StopCircle size={18} />}
                        {isEmergencyLoading ? 'PROCESSING...' : (isStopped ? 'RESTART' : 'EMERGENCY STOP')}
                    </button>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
