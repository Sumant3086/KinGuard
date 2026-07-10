import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { clear as clearCache } from '../api/cache';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  // Read user immediately from localStorage — no async wait, no loading state.
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('kg_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const navigate = useNavigate();

  // Silently validate the stored token in the background.
  // If invalid, the Axios 401 interceptor clears storage and hard-redirects to /login.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      return;
    }
    authApi.getCurrentUser()
      .then(u => {
        setUser(u);
        localStorage.setItem('kg_user', JSON.stringify(u));
      })
      .catch((err) => {
        // 401 interceptor in client.js already handles the redirect + storage cleanup.
        // This catch is a safety net for non-401 network errors.
        console.error('Auth validation error:', err);
        localStorage.removeItem('token');
        localStorage.removeItem('kg_user');
        setUser(null);
      });
  }, []);

  async function login(employeeId, password) {
    const { token, user: userData } = await authApi.login(employeeId, password);
    localStorage.setItem('token', token);
    localStorage.setItem('kg_user', JSON.stringify(userData));
    setUser(userData);
    if (userData.role === 'ADMIN') {
      navigate('/admin/dashboard');
    } else {
      navigate('/store/dashboard');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('kg_user');
    clearCache();
    setUser(null);
    navigate('/login');
  }

  // loading is always false — PrivateRoute no longer blocks on auth check.
  return (
    <AuthContext.Provider value={{ user, loading: false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
