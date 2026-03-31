import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(sessionStorage.getItem('token'));

  // Set up axios interceptor to include token in requests
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token and get user info
      verifyToken();
    } else {
      setLoading(false);
    }
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      // Token invalid or expired
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      const { token, user } = response.data;
      
      sessionStorage.setItem('token', token);
      setToken(token);
      setUser(user);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const hasRole = (role) => {
    return user?.role === role;
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    
    // Admin has all permissions
    if (user.role === 'admin' || user.permissions?.all === true) {
      return true;
    }
    
    return user.permissions?.[permission] === true;
  };

  const canModifySystem = () => {
    if (!user) return false;
    return user.role === 'admin' && user.permissions?.system_changes === true;
  };

  const isDealer = () => {
    return user?.role === 'dealer';
  };

  const value = {
    user,
    loading,
    login,
    logout,
    hasRole,
    hasPermission,
    canModifySystem,
    isDealer,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

