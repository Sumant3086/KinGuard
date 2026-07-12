import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../../shared/api/authApi';
import { clear as clearCache } from '../../shared/api/cache';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

// Only these prefixes are protected routes — used to decide whether a saved
// `from` destination is worth honouring after login.
function isProtectedPath(path) {
  return path &&
    (path.startsWith('/admin') || path.startsWith('/store'));
}

function defaultDashboard(role) {
  return role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard';
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
      .catch(() => {
        if (!live) return;
        localStorage.removeItem('kg_user');
        setUser(null);
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

  async function login(employeeId, password, redirectTo) {
    const { user: userData } = await authApi.login(employeeId, password);
    localStorage.setItem('kg_user', JSON.stringify(userData));
    setUser(userData);

    if (userData.mustChangePassword) {
      navigate('/change-password', { replace: true });
      return;
    }

    // Only honour the saved destination if it's a real protected route.
    // A `from` of '/' or '/login' (public pages) should fall through to
    // the role dashboard — otherwise the user ends up on the home page
    // after signing in from the home page "Sign In" link.
    const dest = isProtectedPath(redirectTo) ? redirectTo : defaultDashboard(userData.role);
    navigate(dest, { replace: true });
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* best-effort */ }
    localStorage.removeItem('kg_user');
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
