import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../../shared/api/authApi';
import { clear as clearCache } from '../../shared/api/cache';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  // Bootstrap from localStorage (profile only — token is an HttpOnly cookie)
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('kg_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  // Validate the session against the server on every page load.
  // The access token lives in an HttpOnly cookie sent automatically.
  // client.js transparently refreshes it on 401 before this resolves.
  // Skip the round-trip entirely when localStorage has no stored user —
  // a fresh visitor can't have a valid cookie, so there's nothing to validate.
  useEffect(() => {
    if (!localStorage.getItem('kg_user')) {
      setLoading(false);
      return;
    }

    let live = true;
    authApi.getCurrentUser()
      .then(userData => {
        if (!live) return;
        setUser(userData);
        localStorage.setItem('kg_user', JSON.stringify(userData));
      })
      .catch(err => {
        if (!live) return;
        // Only clear session on definitive auth failures (401/403).
        // Network errors, 502s, or timeouts should NOT log the user out —
        // they are transient and the token is likely still valid.
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem('kg_user');
          setUser(null);
        }
        // On network error: keep the stored user so the page renders,
        // individual API calls will retry or handle 401 via the refresh interceptor.
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  // Re-fetch the user profile from the server and sync React state.
  // Called after password change so mustChangePassword updates immediately.
  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.getCurrentUser();
      setUser(userData);
      localStorage.setItem('kg_user', JSON.stringify(userData));
      return userData;
    } catch {
      return null;
    }
  }, []);

  async function login(employeeId, password) {
    const { user: userData } = await authApi.login(employeeId, password);
    localStorage.setItem('kg_user', JSON.stringify(userData));
    setUser(userData);
    // Navigation is handled exclusively by LoginPage's useEffect on [user, authLoading].
    // Putting navigate() here AND in the useEffect causes a double navigation: setUser()
    // queues a re-render, navigate() fires first, then the useEffect fires again on the
    // next render cycle — resulting in two back-to-back replace() calls that can land the
    // user on the wrong page.
    //
    // Exception: mustChangePassword forces a specific destination that LoginPage doesn't
    // know about, so we keep that navigate here.
    if (userData.mustChangePassword) {
      navigate('/change-password', { replace: true });
    }
    // For all other cases LoginPage's useEffect does the redirect.
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* best-effort */ }
    localStorage.removeItem('kg_user');
    sessionStorage.clear(); // clear store:returnedReason and any other per-session state
    clearCache();
    setUser(null);
    navigate('/login', { replace: true });
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
