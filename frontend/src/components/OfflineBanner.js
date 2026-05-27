import { useState, useEffect } from 'react';
import './OfflineBanner.css';

/**
 * OfflineBanner — shows a banner when the user loses internet connection.
 * Placed in App.js just inside the router so it appears on every page.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    function handleOffline() { setIsOffline(true); }
    function handleOnline()  { setIsOffline(false); }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <span className="offline-banner__icon">⚠️</span>
      <span className="offline-banner__text">
        You are offline. Some features may be unavailable until your connection is restored.
      </span>
    </div>
  );
}
