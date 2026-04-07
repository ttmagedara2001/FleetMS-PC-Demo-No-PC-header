/**
 * @module Header
 * @description Top-level application header with connection
 * status indicators, notification bell, live clock, and mobile menu toggle.
 */
import { useState, useRef, useEffect } from 'react';
import { Wifi, Radio, Server, Bell, Cpu, Menu, X, Check, Trash2, CheckCheck, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDevice } from '../../contexts/DeviceContext';
import protonestLogo from '../../assets/logo.avif';

// ─── Dropdown Item (hover handled via React state, no Tailwind) ──────────────
const DropdownItem = ({ label, href, active, onClick }) => {
    const [hovered, setHovered] = useState(false);
    return (
        <a
            href={href}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                margin: '2px 6px',
                borderRadius: '10px',
                textDecoration: 'none',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '14px',
                fontWeight: active ? 600 : 400,
                color: active ? '#FFFFFF' : hovered ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                background: active
                    ? 'rgba(164,143,255,0.10)'
                    : hovered
                        ? 'rgba(255,255,255,0.05)'
                        : 'transparent',
                transition: 'background 0.15s ease, color 0.15s ease',
                cursor: 'pointer',
            }}
        >
            <span
                style={{
                    flexShrink: 0,
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: active ? '#A48FFF' : '#5530FA',
                }}
            />
            <span style={{ flex: 1, lineHeight: '1.35' }}>{label}</span>
            {active && (
                <span
                    style={{
                        flexShrink: 0,
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        color: '#A48FFF',
                        border: '1px solid rgba(164,143,255,0.45)',
                        background: 'rgba(164,143,255,0.10)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                    }}
                >
                    Current
                </span>
            )}
        </a>
    );
};

// ─── Brand Bar ───────────────────────────────────────────────────────────────
/**
 * BrandBar — sticky top stripe.
 *
 * • Background  : solid #060B26
 * • Bottom border: 1 px #5530FA
 *
 * Portrait mobile (<sm): 3-row stacked layout
 *   Row 1 — ‹ Go Back (left)  |  Protonest logo (centre)  |  spacer (right)
 *   Row 2 — "Fleet Management System" title + ChevronDown, centred
 *   Row 3 — "View Full Code" frosted-glass button, centred
 *
 * Desktop (sm+): original single horizontal row
 *   Left — Protonest logo + "Go Back To Website"
 *   Centre — title + ChevronDown
 *   Right — "View Full Code"
 *
 * The dropdown flyout is a direct child of brand-bar so it is shared by both
 * layouts. Its inline top is 104px (portrait, below row 2); the CSS class
 * .brand-bar-dropdown overrides this to 88px on sm+.
 */
const BrandBar = () => {
    const [titleOpen, setTitleOpen] = useState(false);

    // Close dropdown when clicking outside the brand bar
    const dropdownRef = useRef(null);
    useEffect(() => {
        function handleOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setTitleOpen(false);
            }
        }
        if (titleOpen) document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [titleOpen]);

    return (
        <div
            ref={dropdownRef}
            className="brand-bar w-full"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 300,
                backgroundColor: '#060B26',
                borderBottom: '1.5px solid rgba(85, 48, 250, 0.70)',
                boxShadow: '0 2px 28px rgba(85, 48, 250, 0.20)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
            }}
        >
            {/* ── Portrait mobile: 3-row stacked (hidden on sm+) ── */}
            <div className="mobile-brand-layout flex sm:hidden flex-col" style={{ padding: '8px 16px 10px' }}>

                {/* Row 1: Go Back | Logo | invisible spacer */}
                <div className="flex items-center justify-between">
                    <a
                        href="https://protonestconnect.co/"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontSize: '13px',
                            fontWeight: 400,
                            color: 'rgba(255,255,255,0.80)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        ‹ Go Back
                    </a>
                    <img
                        src={protonestLogo}
                        alt="Protonest logo"
                        className="h-10 w-10 object-contain"
                    />
                    {/* Spacer keeps logo visually centred */}
                    <div style={{ width: '60px' }} aria-hidden="true" />
                </div>

                {/* Row 2: Title + ChevronDown */}
                <div className="flex justify-center mt-1">
                    <button
                        onClick={() => setTitleOpen(v => !v)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A48FFF]"
                        aria-expanded={titleOpen}
                        aria-haspopup="listbox"
                    >
                        <span
                            className="text-white select-none"
                            style={{
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontWeight: 500,
                                fontSize: '18px',
                                letterSpacing: '-0.01em',
                            }}
                        >
                            Fleet Management System
                        </span>
                        <ChevronDown
                            className={`w-5 h-5 text-white/70 transition-all duration-300 ${titleOpen ? 'rotate-180 text-[#A48FFF]' : ''}`}
                        />
                    </button>
                </div>

                {/* Row 3: View Full Code — content-sized, centred */}
                <div className="flex justify-center mt-2">
                    <a
                        href="https://github.com/ProtonestIoT/PC-Fleet-management-system"
                        target="_blank"
                        rel="noreferrer"
                        className="brand-view-code-btn inline-flex items-center justify-center text-white transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A48FFF]"
                        style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontWeight: 700,
                            background: 'rgba(18, 23, 63, 0.96)',
                            border: '1px solid rgba(122, 135, 220, 0.4)',
                            borderRadius: '10px',
                            padding: '10px 22px',
                            fontSize: '14px',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                            textDecoration: 'none',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 16px rgba(6, 10, 35, 0.32)',
                        }}
                    >
                        View Full Code
                    </a>
                </div>
            </div>

            {/* ── Desktop: single horizontal row (shown on sm+) ── */}
            <div
                className="desktop-brand-layout hidden sm:flex items-center justify-between"
                style={{ height: '88px', paddingLeft: '32px', paddingRight: '32px' }}
            >
                {/* Left: Protonest logo + back link */}
                <div className="flex items-center min-w-[180px] mr-8">
                    <a
                        href="https://protonestconnect.co/"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 group"
                        aria-label="Protonest — Go back to website"
                    >
                        <img
                            src={protonestLogo}
                            alt="Protonest logo"
                            className="h-10 w-10 object-contain flex-shrink-0 transition-all duration-300 group-hover:scale-105"
                        />
                        <span
                            className="brand-back-text text-white/80 group-hover:text-white transition-colors duration-200 whitespace-nowrap ml-0.5"
                            style={{
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontSize: '12px',
                                fontWeight: 400,
                            }}
                        >
                            ‹ Go Back To Website
                        </span>
                    </a>
                </div>

                {/* Centre: Title with dropdown chevron */}
                <div className="flex-1 flex justify-center">
                    <button
                        onClick={() => setTitleOpen(v => !v)}
                        className="flex items-center gap-2 group px-4 py-2 rounded-xl hover:bg-white/5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A48FFF]"
                        aria-expanded={titleOpen}
                        aria-haspopup="listbox"
                    >
                        <span
                            className="brand-bar-title text-white select-none"
                            style={{
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontWeight: 500,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            Fleet Management System
                        </span>
                        <ChevronDown
                            className={`w-5 h-5 text-white/70 group-hover:text-white transition-all duration-300 ${titleOpen ? 'rotate-180 text-[#A48FFF]' : ''}`}
                        />
                    </button>
                </div>

                {/* Right: "View Full Code" button */}
                <div className="flex items-center justify-end min-w-[180px] ml-8">
                    <a
                        href="https://github.com/ProtonestIoT/PC-Fleet-management-system"
                        target="_blank"
                        rel="noreferrer"
                        className="brand-view-code-btn inline-flex items-center justify-center text-white transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A48FFF]"
                        style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontWeight: 700,
                            background: 'rgba(18, 23, 63, 0.96)',
                            border: '1px solid rgba(122, 135, 220, 0.4)',
                            borderRadius: '10px',
                            padding: '10px 22px',
                            fontSize: '14px',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                            textDecoration: 'none',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 16px rgba(6, 10, 35, 0.32)',
                        }}
                    >
                        View Full Code
                    </a>
                </div>
            </div>

            {/* ── Shared dropdown flyout — direct child of brand-bar ──
                inline top: 104px positions it below portrait row 2;
                .brand-bar-dropdown CSS overrides to 88px on sm+          ── */}
            {titleOpen && (
                <div
                    className="brand-bar-dropdown"
                    style={{
                        position: 'absolute',
                        top: '104px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 200,
                        marginTop: '4px',
                        width: '288px',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        background: '#0F1535',
                        border: '1px solid rgba(85, 48, 250, 0.5)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                    }}
                >
                    {/* Header label */}
                    <div
                        style={{
                            padding: '14px 20px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.07)',
                        }}
                    >
                        <p
                            style={{
                                margin: 0,
                                color: '#818CF8',
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontSize: '11px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.16em',
                            }}
                        >
                            Switch System
                        </p>
                    </div>

                    {/* Items */}
                    <div style={{ padding: '6px 0' }}>
                        {[
                            {
                                label: 'Fleet Management System',
                                href: 'https://gentle-flower-091576403.6.azurestaticapps.net/',
                                active: true,
                            },
                            {
                                label: 'Plant Monitoring System',
                                href: 'https://ambitious-bay-0d5177503.4.azurestaticapps.net/',
                                active: false,
                            },
                            {
                                label: 'Factory Management System',
                                href: 'https://witty-grass-0d4e8e603.6.azurestaticapps.net/',
                                active: false,
                            },
                        ].map(({ label, href, active }) => (
                            <DropdownItem
                                key={label}
                                label={label}
                                href={href}
                                active={active}
                                onClick={() => setTitleOpen(false)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Notification Action Button (header actions: mark-all / clear-all) ────────
const NotifActionButton = ({ onClick, title, danger, children }) => {
    const [hov, setHov] = useState(false);
    return (
        <button
            onClick={onClick}
            title={title}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '32px', height: '32px',
                border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                background: hov
                    ? (danger ? '#FEE2E2' : '#F3F4F6')
                    : '#F9FAFB',
                borderColor: hov
                    ? (danger ? '#FECACA' : '#E5E7EB')
                    : '#E5E7EB',
                color: hov
                    ? (danger ? '#DC2626' : '#374151')
                    : '#6B7280',
            }}
        >{children}</button>
    );
};

// ─── Notification Row Button (per-item actions: mark-read / remove) ───────────
const NotifRowButton = ({ onClick, title, danger, children }) => {
    const [hov, setHov] = useState(false);
    return (
        <button
            onClick={onClick}
            title={title}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '26px', height: '26px', flexShrink: 0,
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
                background: hov
                    ? (danger ? '#FEE2E2' : '#F3F4F6')
                    : 'transparent',
                color: hov
                    ? (danger ? '#DC2626' : '#374151')
                    : '#9CA3AF',
            }}
        >{children}</button>
    );
};

// ─── Mobile Sheet Action Button ───────────────────────────────────────────────
const MobileNotifButton = ({ onClick, title, danger, icon: Icon, label }) => {
    const [hov, setHov] = useState(false);
    return (
        <button
            onClick={onClick}
            title={title}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '8px 13px',
                border: '1px solid',
                borderColor: hov
                    ? (danger ? '#FECACA' : '#D1D5DB')
                    : (danger ? '#FCA5A5' : '#E5E7EB'),
                borderRadius: '10px',
                cursor: 'pointer',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '12px', fontWeight: 600,
                transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                background: hov
                    ? (danger ? '#FEE2E2' : '#F3F4F6')
                    : (danger ? '#FEF2F2' : '#FFFFFF'),
                color: hov
                    ? (danger ? '#B91C1C' : '#374151')
                    : (danger ? '#DC2626' : '#6B7280'),
            }}
        >
            <Icon size={14} />
            {label && <span>{label}</span>}
        </button>
    );
};

function Header({ onMenuToggle, sidebarOpen }) {
    const { isAuthenticated, isDemoMode } = useAuth();
    const {
        alerts,
        isConnected,
        clearAlert,
        clearAllAlerts,
        markAlertRead,
        markAllAlertsRead,
        devices,
        selectedDeviceId,
        setSelectedDeviceId,
    } = useDevice();

    const unreadAlerts = alerts.filter(a => !a.read).length;
    const [showNotifications, setShowNotifications] = useState(false);
    const notifRef = useRef(null);
    const bellRef = useRef(null);
    const [isMobile, setIsMobile] = useState(false);
    const [viewport, setViewport] = useState({ width: 1280, height: 720 });
    const [now, setNow] = useState(new Date());
    const [hoveredAlertId, setHoveredAlertId] = useState(null);

    // Clock timer
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Click outside to close notifications (desktop only)
    useEffect(() => {
        function handleClickOutside(e) {
            if (notifRef.current && !notifRef.current.contains(e.target) &&
                bellRef.current && !bellRef.current.contains(e.target)) {
                setShowNotifications(false);
            }
        }
        if (showNotifications && !isMobile) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showNotifications, isMobile]);

    // Responsive detection
    useEffect(() => {
        function onResize() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            setViewport({ width, height });
            setIsMobile(width <= 768);
        }
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Escape key to close mobile notifications
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape' && showNotifications) setShowNotifications(false);
        }
        if (showNotifications) document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [showNotifications]);

    // Lock body scroll when mobile notifications are open
    useEffect(() => {
        if (showNotifications && isMobile) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [showNotifications, isMobile]);

    // Date/time formatting helpers
    function getOrdinal(n) {
        const v = n % 100;
        if (v >= 11 && v <= 13) return 'th';
        switch (n % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    }

    function formatDatePretty(d) {
        if (!d) return '';
        try {
            const day = d.getDate();
            const ordinal = getOrdinal(day);
            const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
            const month = d.toLocaleDateString(undefined, { month: 'short' });
            const year = d.getFullYear();
            return `${day}${ordinal} ${weekday}, ${month} ${year}`;
        } catch (e) {
            return d.toLocaleDateString();
        }
    }

    function formatTimePretty(d) {
        if (!d) return '';
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatAlertTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    }

    function getAlertIcon(type) {
        if (type === 'critical') return '🔴';
        if (type === 'warning') return '🟡';
        return '🟢';
    }

    const toggleNotifications = () => {
        setShowNotifications(s => !s);
    };

    const selectedDevice = devices.find((device) => device.id === selectedDeviceId) || devices[0] || null;

    const areaOptions = ['Area 1', 'Area 2', 'Area 3', 'Area 4'];

    const handleDeviceChange = (areaName) => {
        const nextDevice = devices.find((device) => device.name === areaName);
        if (nextDevice) {
            setSelectedDeviceId(nextDevice.id);
        }
    };

    return (
        <>
            <header
                className="app-header-bar w-full fixed left-0 right-0 z-[100] h-16 flex items-center gap-3"
                style={{
                    background: 'linear-gradient(135deg, #6B21A8 0%, #7C3AED 50%, #9333EA 100%)',
                    boxShadow: '0 4px 24px rgba(107, 33, 168, 0.45), 0 1px 0 rgba(255,255,255,0.08) inset',
                }}
            >
                {/* Mobile Menu Button — shown on ≤1024 px */}
                <button
                    className="header-menu-toggle flex lg:hidden items-center justify-center w-10 h-10 bg-white/15 rounded-[10px] text-white shrink-0 transition-all duration-200 hover:bg-white/25 hover:-translate-y-px border border-white/20 backdrop-blur-[8px] shadow-[0_4px_6px_rgba(0,0,0,0.1)] focus:outline-none mr-1 sm:mr-2"
                    onClick={onMenuToggle}
                    aria-label={sidebarOpen ? "Close menu" : "Open menu"}
                >
                    {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
                </button>

                {/* Logo */}
                <div className="header-logo-wrap flex items-center gap-2.5 shrink-0 mr-1 sm:mr-4">
                    <div className="w-10 h-10 bg-[#5530FA] rounded-lg flex items-center justify-center text-white shadow-md">
                        <Cpu size={22} />
                    </div>
                    <span
                        className="header-logo-text text-[22px] font-bold text-white tracking-tight hidden md:inline"
                        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                        Fabrix
                    </span>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Device selector */}
                <div className="header-device-wrap hidden md:flex items-center gap-2 mr-2 lg:mr-4">
                    <div className="header-device-wrapper">
                        <select
                            className="header-device-selector"
                            aria-label="Select device"
                            value={selectedDevice?.name || ''}
                            onChange={(e) => handleDeviceChange(e.target.value)}
                            title="Select device"
                        >
                            {areaOptions.map((areaName) => (
                                <option key={areaName} value={areaName}>
                                    {areaName}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Date/Time — hidden on small portrait screens */}
                <div className="header-datetime hidden lg:flex flex-col items-end text-white/90 mr-5">
                    <div
                        className="text-[11px] font-medium opacity-80 leading-none"
                        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                        {formatDatePretty(now)}
                    </div>
                    <div
                        className="text-[15px] font-semibold mt-[3px] leading-none"
                        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                        {formatTimePretty(now)}
                    </div>
                </div>

                {/* Right Icons Section */}
                <div className="header-icons-wrap flex items-center gap-2.5 sm:gap-4">
                    {/* Connection Status Icons — hidden on xs screens */}
                    <div className="header-status-icons hidden sm:flex items-center gap-2.5 lg:gap-3">
                        <div
                            className={`w-9 h-9 rounded-[10px] border flex items-center justify-center transition-all duration-200 cursor-default backdrop-blur-[8px] shadow-[0_4px_6px_rgba(0,0,0,0.1)] hover:-translate-y-px ${isConnected || isDemoMode
                                ? 'bg-green-500/25 border-green-400/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                : 'bg-white/10 border-white/20 text-white/60'
                                }`}
                            title={isDemoMode ? 'Mock WebSocket (Demo)' : 'WebSocket Status'}
                        >
                            <Wifi size={16} />
                        </div>
                        <div
                            className="w-9 h-9 bg-green-500/25 border border-green-400/50 rounded-[10px] flex items-center justify-center text-green-400 cursor-default backdrop-blur-[8px] shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                            title={isDemoMode ? 'Mock API (Demo)' : 'HTTP API'}
                        >
                            <Radio size={16} />
                        </div>
                        <div
                            className={`w-9 h-9 rounded-[10px] border flex items-center justify-center transition-all duration-200 cursor-default backdrop-blur-[8px] shadow-[0_4px_6px_rgba(0,0,0,0.1)] hover:-translate-y-px ${isAuthenticated
                                ? 'bg-green-500/25 border-green-400/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                : 'bg-white/10 border-white/20 text-white/60'
                                }`}
                            title={isDemoMode ? 'Demo Server' : 'Server'}
                        >
                            <Server size={16} />
                        </div>
                    </div>

                    {/* Notification Bell */}
                    <div className="relative" ref={bellRef}>
                        <button
                            className="w-10 h-10 bg-white/15 border border-white/20 rounded-[10px] flex items-center justify-center text-white cursor-pointer transition-all duration-200 hover:bg-white/25 hover:-translate-y-px backdrop-blur-[8px] shadow-[0_4px_6px_rgba(0,0,0,0.1)] focus:outline-none relative"
                            onClick={toggleNotifications}
                            aria-label="Notifications"
                            aria-expanded={showNotifications}
                        >
                            <Bell size={19} />
                            {unreadAlerts > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-purple-900">
                                    {unreadAlerts > 9 ? '9+' : unreadAlerts}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Desktop Notification Popover */}
                {showNotifications && !isMobile && (
                    <div
                        ref={notifRef}
                        style={{
                            position: 'fixed',
                            top: '76px',
                            right: '20px',
                            width: '380px',
                            maxWidth: 'calc(100vw - 40px)',
                            background: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            borderRadius: '20px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
                            zIndex: 200,
                            overflow: 'hidden',
                            fontFamily: "'Inter', system-ui, sans-serif",
                        }}
                    >
                        {/* Top accent gradient line */}
                        <div style={{ height: '3px', background: 'linear-gradient(90deg, #5530FA 0%, #A48FFF 50%, #5530FA 100%)' }} />

                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px 14px',
                            borderBottom: '1px solid #F3F4F6',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Bell size={16} color="#5530FA" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827', letterSpacing: '-0.015em' }}>
                                    Notifications
                                </span>
                                {unreadAlerts > 0 && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        minWidth: '20px', height: '20px', padding: '0 6px',
                                        background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                        borderRadius: '10px', fontSize: '10px', fontWeight: 800,
                                        color: '#fff', letterSpacing: '0.02em',
                                        boxShadow: '0 2px 8px rgba(239,68,68,0.55)',
                                    }}>
                                        {unreadAlerts > 9 ? '9+' : unreadAlerts}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <NotifActionButton title="Mark all as read" onClick={() => markAllAlertsRead()}>
                                    <CheckCheck size={15} />
                                </NotifActionButton>
                                <NotifActionButton title="Clear all" danger onClick={() => { clearAllAlerts(); setShowNotifications(false); }}>
                                    <Trash2 size={15} />
                                </NotifActionButton>
                            </div>
                        </div>

                        {/* Notification list */}
                        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '6px 0', background: '#FFFFFF' }}>
                            {alerts.length === 0 ? (
                                <div style={{ padding: '52px 24px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '38px', marginBottom: '14px', lineHeight: 1 }}>🔔</div>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#6B7280' }}>
                                        No notifications yet
                                    </p>
                                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#9CA3AF' }}>
                                        You're all caught up!
                                    </p>
                                </div>
                            ) : (
                                alerts.slice(0, 10).map(a => {
                                    const accentColor =
                                        a.type === 'critical' ? '#EF4444' :
                                        a.type === 'warning' ? '#F59E0B' : '#22C55E';
                                    const isHov = hoveredAlertId === a.id;
                                    return (
                                        <div
                                            key={a.id}
                                            onMouseEnter={() => setHoveredAlertId(a.id)}
                                            onMouseLeave={() => setHoveredAlertId(null)}
                                            style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '12px',
                                                padding: '12px 16px 12px 14px',
                                                borderBottom: '1px solid #F3F4F6',
                                                borderLeft: `3px solid ${!a.read ? accentColor : '#E5E7EB'}`,
                                                background: isHov
                                                    ? '#F9FAFB'
                                                    : (!a.read ? '#EFF6FF' : '#FFFFFF'),
                                                transition: 'background 0.15s ease',
                                            }}
                                        >
                                            <span style={{ flexShrink: 0, fontSize: '15px', marginTop: '1px', lineHeight: 1 }}>
                                                {getAlertIcon(a.type)}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{
                                                    margin: 0, marginBottom: '4px',
                                                    fontSize: '13px', lineHeight: '1.45',
                                                    color: !a.read ? '#111827' : '#6B7280',
                                                    fontWeight: !a.read ? 500 : 400,
                                                }}>{a.message}</p>
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: '#9CA3AF',
                                                    letterSpacing: '0.01em',
                                                }}>{formatAlertTime(a.timestamp)}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginTop: '1px' }}>
                                                {!a.read && (
                                                    <NotifRowButton title="Mark as read" onClick={() => markAlertRead(a.id)}>
                                                        <Check size={13} />
                                                    </NotifRowButton>
                                                )}
                                                <NotifRowButton title="Remove" danger onClick={() => clearAlert(a.id)}>
                                                    <X size={13} />
                                                </NotifRowButton>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* Mobile Full-Screen Notification Panel */}
                {showNotifications && isMobile && (
                    <div
                        style={{
                            position: 'fixed', inset: 0,
                            background: 'rgba(17, 24, 39, 0.45)',
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                            zIndex: 1000,
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                        }}
                        onClick={() => setShowNotifications(false)}
                    >
                        <div
                            style={{
                                width: '100%',
                                maxHeight: '88vh',
                                background: '#FFFFFF',
                                borderRadius: '24px 24px 0 0',
                                borderTop: '1px solid #E5E7EB',
                                borderLeft: '1px solid #E5E7EB',
                                borderRight: '1px solid #E5E7EB',
                                boxShadow: '0 -8px 40px rgba(0,0,0,0.12), 0 -2px 8px rgba(0,0,0,0.06)',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                fontFamily: "'Inter', system-ui, sans-serif",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Top accent line */}
                            <div style={{ height: '3px', background: 'linear-gradient(90deg, #5530FA 0%, #A48FFF 50%, #5530FA 100%)', borderRadius: '24px 24px 0 0' }} />

                            {/* Drag handle */}
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
                                <div style={{ width: '40px', height: '4px', background: '#D1D5DB', borderRadius: '2px' }} />
                            </div>

                            {/* Header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 20px 16px',
                                borderBottom: '1px solid #F3F4F6',
                                flexShrink: 0,
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
                                            Notifications
                                        </span>
                                        {unreadAlerts > 0 && (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                minWidth: '22px', height: '22px', padding: '0 7px',
                                                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                                borderRadius: '11px', fontSize: '11px', fontWeight: 800, color: '#fff',
                                                boxShadow: '0 2px 8px rgba(239,68,68,0.55)', letterSpacing: '0.02em',
                                            }}>
                                                {unreadAlerts > 9 ? '9+' : unreadAlerts}
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                                        {unreadAlerts > 0
                                            ? `${unreadAlerts} unread notification${unreadAlerts > 1 ? 's' : ''}`
                                            : 'All caught up!'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <MobileNotifButton
                                        onClick={() => markAllAlertsRead()}
                                        title="Mark all as read"
                                        icon={CheckCheck}
                                        label="Mark all"
                                    />
                                    <MobileNotifButton
                                        onClick={() => { clearAllAlerts(); setShowNotifications(false); }}
                                        title="Clear all"
                                        icon={Trash2}
                                        label="Clear all"
                                        danger
                                    />
                                    <button
                                        onClick={() => setShowNotifications(false)}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: '36px', height: '36px', marginLeft: '2px',
                                            background: '#F3F4F6', border: '1px solid #E5E7EB',
                                            borderRadius: '50%', cursor: 'pointer',
                                            color: '#6B7280',
                                        }}
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Mobile notification list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', background: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
                                {alerts.length === 0 ? (
                                    <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '48px', marginBottom: '16px', lineHeight: 1 }}>🔔</div>
                                        <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#6B7280' }}>
                                            No notifications yet
                                        </p>
                                        <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#9CA3AF' }}>
                                            You're all caught up!
                                        </p>
                                    </div>
                                ) : (
                                    alerts.map(a => {
                                        const accentColor =
                                            a.type === 'critical' ? '#EF4444' :
                                            a.type === 'warning' ? '#F59E0B' : '#22C55E';
                                        return (
                                            <div
                                                key={a.id}
                                                style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: '14px',
                                                    padding: '14px 20px 14px 16px',
                                                    borderBottom: '1px solid #F3F4F6',
                                                    borderLeft: `4px solid ${!a.read ? accentColor : '#E5E7EB'}`,
                                                    background: !a.read ? '#EFF6FF' : '#FFFFFF',
                                                }}
                                            >
                                                <div style={{
                                                    width: '9px', height: '9px', borderRadius: '50%',
                                                    background: accentColor, flexShrink: 0, marginTop: '5px',
                                                    boxShadow: `0 0 6px ${accentColor}60`,
                                                }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{
                                                        margin: 0, marginBottom: '5px',
                                                        fontSize: '14px', lineHeight: '1.45',
                                                        color: !a.read ? '#111827' : '#6B7280',
                                                        fontWeight: !a.read ? 500 : 400,
                                                    }}>{a.message}</p>
                                                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                                                        {formatAlertTime(a.timestamp)}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                    {!a.read && (
                                                        <NotifRowButton title="Mark as read" onClick={() => markAlertRead(a.id)}>
                                                            <Check size={15} />
                                                        </NotifRowButton>
                                                    )}
                                                    <NotifRowButton title="Remove" danger onClick={() => clearAlert(a.id)}>
                                                        <X size={15} />
                                                    </NotifRowButton>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </header>
        </>
    );
}

export default Header;
