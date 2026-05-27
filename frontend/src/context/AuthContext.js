import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import config from '../config';
import { supabase } from '../config/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem(config.tokenKey);
      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthContext] verifyToken called');
      }
    if (!token) { setLoading(false); return null; }
    try {
      const { data } = await authAPI.verify();
      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthContext] verifyToken response success');
      }
      // include businessName if provided
      const u = { ...data.data };
      if (data.data.businessName) u.businessName = data.data.businessName;
      setUser(u);
      return u;
    } catch (err) {
      console.error('[AuthContext] verifyToken error', err);
      localStorage.removeItem(config.tokenKey);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { verifyToken(); }, [verifyToken]);

  const login = (token, userData) => {
    console.log('[AuthContext] login called, token=', token, 'userData=', userData);
    localStorage.setItem(config.tokenKey, token);
    setUser(userData);
    // Notify locations context to reload after login.
    // Do NOT dispatch sikabuk:activeLocationChanged here — that would clear the
    // stored active location because the plain Event has no detail.id, and the
    // handler resolves it as '' (meaning "all shops").
    window.dispatchEvent(new Event('sikabuk:locationsChanged'));
  };

  // Perform full sign-out: clear Supabase session + local JWT
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // ignore Supabase signOut errors but proceed to clear local state
      console.warn('supabase.signOut() failed during logout:', err?.message || err);
    }
    localStorage.removeItem(config.tokenKey);
    setUser(null);
  };

  const isOwner  = user?.role === 'owner' || user?.role === 'cofounder';
  const isWorker = user?.role !== 'owner' && user?.role !== 'cofounder' && !!user;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isOwner, isWorker, verifyToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
