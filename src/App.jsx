/**
 * Fabrix Fleet Management System — Root Application
 *
 * Wraps the app in Auth + Device context providers and handles
 * top-level routing between Dashboard, Analysis, and Settings pages.
 * Authentication state drives loading / error screens.
 *
 * @module App
 */
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DeviceProvider } from './contexts/DeviceContext';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';
import LoadingScreen from './components/LoadingScreen';

/* ------------------------------------------------------------------ */
/*  Error Screen — shown when authentication fails                    */
/* ------------------------------------------------------------------ */
function ErrorScreen({ error, onRetry }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Error icon */}
        <div className="auth-error-icon">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 className="auth-error-title">Connection Failed</h2>
        <p className="auth-error-message">
          {error || 'Unable to reach the server. Check your connection and try again.'}
        </p>

        <button className="auth-retry-btn" onClick={onRetry}>Try Again</button>
        <p className="auth-help-text">If this persists, contact your administrator.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App Content — authenticated shell with sidebar + page routing     */
/* ------------------------------------------------------------------ */

/** Valid tab identifiers for navigation. */
const VALID_TABS = ['dashboard', 'analysis', 'settings'];

function AppContent() {
  const { isLoading: authLoading, isAuthenticated, error: authError, performLogin } = useAuth();

  // Persist active tab across page reloads
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem('fabrix_activeTab');
      return VALID_TABS.includes(saved) ? saved : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('fabrix_activeTab', activeTab); } catch { /* quota exceeded — ignore */ }
  }, [activeTab]);

  if (authLoading) return <LoadingScreen message="Authenticating..." />;
  if (authError && !isAuthenticated) return <ErrorScreen error={authError} onRetry={performLogin} />;

  /** Render the active page based on the selected tab. */
  const renderPage = () => {
    switch (activeTab) {
      case 'analysis': return <Analysis />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header onMenuToggle={() => setSidebarOpen(prev => !prev)} sidebarOpen={sidebarOpen} />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">{renderPage()}</main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App — root component with context providers                       */
/* ------------------------------------------------------------------ */
function App() {
  return (
    <AuthProvider>
      <DeviceProvider>
        <AppContent />
      </DeviceProvider>
    </AuthProvider>
  );
}

export default App;
