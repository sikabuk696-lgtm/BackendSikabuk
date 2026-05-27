import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { notificationsAPI } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const POLL_INTERVAL_MS = 15000; // 15 seconds

export function NotificationProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  // Fetch latest notifications from the server
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationsAPI.getAll({ limit: 50 });
      if (res.data?.success) {
        const data = res.data.notifications || [];
        setNotifications(data);
        // A notification is "unread" if the current worker's ID is NOT in read_by.
        // We get the workerId from the stored JWT.
        const token = localStorage.getItem(
          process.env.REACT_APP_TOKEN_KEY || 'sikabook_token'
        );
        let workerId = null;
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            workerId = payload.workerId || payload.sub || null;
          } catch (_) {}
        }
        const unread = workerId
          ? data.filter(n => !(n.read_by || []).includes(workerId)).length
          : data.length;
        setUnreadCount(unread);
      }
    } catch (_) {
      // Silent fail — notification fetch must never break the app
    }
  }, [isAuthenticated]);

  // Mark a single notification as read
  const markRead = useCallback(async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev =>
        prev.map(n => {
          if (n.id !== id) return n;
          const token = localStorage.getItem(
            process.env.REACT_APP_TOKEN_KEY || 'sikabook_token'
          );
          let workerId = null;
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              workerId = payload.workerId || payload.sub || null;
            } catch (_) {}
          }
          const readBy = n.read_by || [];
          return workerId && !readBy.includes(workerId)
            ? { ...n, read_by: [...readBy, workerId] }
            : n;
        })
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (_) {}
  }, []);

  // Mark all notifications as read
  const markAllRead = useCallback(async () => {
    try {
      await notificationsAPI.markAllRead();
      const token = localStorage.getItem(
        process.env.REACT_APP_TOKEN_KEY || 'sikabook_token'
      );
      let workerId = null;
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          workerId = payload.workerId || payload.sub || null;
        } catch (_) {}
      }
      if (workerId) {
        setNotifications(prev =>
          prev.map(n => {
            const readBy = n.read_by || [];
            return readBy.includes(workerId)
              ? n
              : { ...n, read_by: [...readBy, workerId] };
          })
        );
      }
      setUnreadCount(0);
    } catch (_) {}
  }, []);

  // Start/stop polling based on auth state
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Initial fetch
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));

    // Poll every 15 seconds when the tab is visible
    intervalRef.current = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, POLL_INTERVAL_MS);

    // Also re-fetch when the tab becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, markRead, markAllRead, refresh: fetchNotifications }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
