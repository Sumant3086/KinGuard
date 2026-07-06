import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }

  async function login(employeeId, password) {
    const { token, user: userData } = await authApi.login(employeeId, password);
    localStorage.setItem('token', token);
    setUser(userData);
    // User data already received from login response - no need to call /auth/me

    // Navigate based on role
    if (userData.role === 'ADMIN') {
      navigate('/admin/dashboard');
    } else {
      navigate('/store/dashboard');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  }

  const value = {
    user,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
