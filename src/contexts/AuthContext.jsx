/**
 * Authentication Context — DEMO MODE
 *
 * Bypasses real authentication entirely.
 * The app enters "Demo Mode" automatically on mount,
 * simulating a successful login with no backend required.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import {
    mockLogin,
    mockGetToken,
    mockClearTokens,
} from '../services/mockDataService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Perform login — Demo mode: always succeeds. */
    const performLogin = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const success = await mockLogin();
            if (success) {
                setIsAuthenticated(true);
                setError(null);
                return success;
            }
        } catch (err) {
            console.error('[Auth] Demo login failed:', err.message);
            setError(err.message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-login on mount — Demo Mode entry
    useEffect(() => {
        async function autoLogin() {
            try {
                const success = await mockLogin();
                if (success) {
                    setIsAuthenticated(true);
                    setError(null);
                }
            } catch (err) {
                console.error('[Auth] Demo auto-login failed:', err.message);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        }

        autoLogin();
    }, []);

    const logout = () => {
        mockClearTokens();
        setIsAuthenticated(false);
        setError(null);
    };

    const value = {
        // Expose the demo token so consumers see the app as authenticated
        token: mockGetToken(),
        isAuthenticated,
        isLoading,
        error,
        logout,
        performLogin,
        // Flag so UI can show "Demo Mode" badge
        isDemoMode: true,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export default AuthContext;
