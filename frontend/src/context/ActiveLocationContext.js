import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { locationsAPI } from '../services/api';
import { useAuth } from './AuthContext';

const ActiveLocationContext = createContext(null);
const STORAGE_KEY = 'sikabuk_activeLocationId';

export function ActiveLocationProvider({ children }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  // counter for inflight requests; used to ignore stale responses
  const requestIdRef = useRef(0);
  const [activeLocationId, setActiveLocationId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  });

  const isMountedRef = useRef(true);
  const safetyTimerRef = useRef(null);

  const clearSafetyTimer = () => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  const loadLocations = React.useCallback(async () => {
    // if user not logged in we don't need to fetch locations
    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ActiveLocation] loadLocations skipped (no user)');
      }
      setLocations([]);
      setLoading(false);
      return;
    }
    // NOTE: user is included in deps below so this closure always sees the current user

    // increment request id for this call
    const reqId = ++requestIdRef.current;
    if (isMountedRef.current) setLoading(true);
    // safety fallback: if loading remains true for >6s, clear it so UI isn't stuck
    clearSafetyTimer();
    safetyTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && requestIdRef.current === reqId) {
        console.warn('[ActiveLocation] safety timeout — clearing loading state');
        setLoading(false);
      }
    }, 6000);

    console.log('[ActiveLocation] loadLocations:start (req', reqId + ')');
    try {
      const res = await locationsAPI.getAll();
      console.log('[ActiveLocation] loadLocations:api-res (req', reqId + ')', res?.data?.locations);
      if (!isMountedRef.current || requestIdRef.current !== reqId) {
        console.log('[ActiveLocation] loadLocations:ignoring stale response (req', reqId + ')');
        return;
      }
      setLocations(res.data.locations || []);
    } catch (err) {
      console.error('[ActiveLocation] loadLocations:error (req', reqId + ')', err && (err.message || err));
      if (!isMountedRef.current || requestIdRef.current !== reqId) return;
      setLocations([]);
    } finally {
      clearSafetyTimer();
      if (isMountedRef.current && requestIdRef.current === reqId) {
        setLoading(false);
        console.log('[ActiveLocation] loadLocations:done -> loading:false (req', reqId + ')');
      }
    }
  }, [user]);

  useEffect(() => {
    // StrictMode may run this effect twice; make sure the mounted flag is reset each time
    isMountedRef.current = true;

    // initial load
    loadLocations();

    // listen for external updates (create/update/delete shops)
    const onLocationsChanged = (e) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ActiveLocation] event locationsChanged', e?.detail);
      }
      // if the event provides a new location, add it immediately for optimistic UI
      if (e?.detail?.added) {
        setLocations((prev) => {
          const exists = prev.find((l) => l.id === e.detail.added.id);
          if (exists) return prev;
          return [...prev, e.detail.added];
        });
      }
      // if the event provides a removed id, drop it immediately
      if (e?.detail?.removed) {
        setLocations((prev) => prev.filter((l) => l.id !== e.detail.removed));
      }

      loadLocations();
    };
    window.addEventListener('sikabuk:locationsChanged', onLocationsChanged);

    // also listen for activeLocationChanged events; update state when received.
    // IMPORTANT: do NOT call setActive() here – setActive() re-dispatches
    // sikabuk:activeLocationChanged which would create an infinite synchronous loop.
    // Instead update localStorage and state directly.
    const onActiveChanged = (e) => {
      const id = e?.detail?.id || '';
      try { localStorage.setItem(STORAGE_KEY, id); } catch (_e) {}
      setActiveLocationId(id);
    };
    window.addEventListener('sikabuk:activeLocationChanged', onActiveChanged);

    return () => {
      // mark unmounted and cleanup
      isMountedRef.current = false;
      clearSafetyTimer();
      window.removeEventListener('sikabuk:locationsChanged', onLocationsChanged);
      window.removeEventListener('sikabuk:activeLocationChanged', onActiveChanged);
    };
  }, [loadLocations]);

  // reload shops whenever auth state changes (e.g. user logs in/out)
  useEffect(() => {
    if (user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ActiveLocation] user changed, reloading locations');
      }
      loadLocations();
    }
  }, [user, loadLocations]);

  // if a worker logs in and they have a locationId, prefer that
  useEffect(() => {
    if (user?.locationId && (!activeLocationId || activeLocationId === '')) {
      setActiveLocationId(user.locationId);
      try { localStorage.setItem(STORAGE_KEY, user.locationId); } catch (e) {}
    }
  }, [user, activeLocationId]);

  // For brand-new owners (key was never set = null), auto-select the first
  // location so they land on their default shop instead of 'All Shops'
  useEffect(() => {
    if (!loading && locations.length > 0) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null && user?.role === 'owner') {
          const first = locations[0];
          localStorage.setItem(STORAGE_KEY, first.id);
          setActiveLocationId(first.id);
          window.dispatchEvent(new CustomEvent('sikabuk:activeLocationChanged', { detail: { id: first.id } }));
        }
      } catch (_) {}
    }
  }, [loading, locations, user]);

  const setActive = (id) => {
    // Workers are locked to their assigned shop — disallow changes
    if (user?.role === 'worker' && user?.locationId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ActiveLocation] setActive blocked for worker (locked to locationId:', user.locationId, ')');
      }
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, id || ''); } catch (e) {}
    setActiveLocationId(id || '');
    // notify other parts of the app that care
    window.dispatchEvent(new CustomEvent('sikabuk:activeLocationChanged', { detail: { id: id || '' } }));
  };

  // Whether the current user is locked to a single shop (workers with location assigned)
  const isLockedToShop = user?.role === 'worker' && !!user?.locationId;

  return (
    <ActiveLocationContext.Provider value={{ locations, loading, activeLocationId, setActive, isLockedToShop }}>
      {children}
    </ActiveLocationContext.Provider>
  );
}

export function useActiveLocation() {
  const ctx = useContext(ActiveLocationContext);
  if (!ctx) throw new Error('useActiveLocation must be used inside ActiveLocationProvider');
  return ctx;
}
