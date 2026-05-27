import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { HiOutlineShoppingBag } from 'react-icons/hi';
import './HeaderShopSelector.css';

export default function HeaderShopSelector() {
  const { user, isOwner } = useAuth();
  const { locations, loading, activeLocationId, setActive } = useActiveLocation();
  const { currency, ghsToUsd, rateLoading, rateError, lastUpdated, toggle: toggleCurrency } = useCurrency();
  const [local, setLocal] = useState(activeLocationId || '');
  const businessName = user?.businessName || '';

  useEffect(() => setLocal(activeLocationId || ''), [activeLocationId]);

  const handleChange = (e) => {
    let val = e.target.value || '';
    // If empty (the business-level option) we leave it blank; no need for fake 'main' lookup
    if (val === '') {
      // nothing to do
    }
    setLocal(val);
    setActive(val);
    // no navigation – the current page listens for activeLocationId and will reload data
  };

  const handleFocus = () => {
    // only reload when we aren't already in the middle of a fetch
    if (!loading && (!locations || locations.length === 0)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[HeaderShopSelector] focus -> no locations, triggering reload');
      }
      window.dispatchEvent(new Event('sikabuk:locationsChanged'));
    }
  };

  const currentShopName = () => {
    // if there is an explicit local selection, show it
    if (local) {
      const loc = locations.find((l) => l.id === local);
      return loc ? loc.name : businessName || 'Main';
    }
    // otherwise fall back: if user has a stored locationId (worker default)
    if (!local && user?.locationId) {
      const found = locations.find((l) => l.id === user.locationId);
      return found ? found.name : businessName || 'Main';
    }
    // no location selected — show 'All Shops'
    return 'All Shops';
  };

  // debug: log whenever locations/loading change
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[HeaderShopSelector] effect -> loading=', loading, 'locations.length=', (locations || []).length, 'activeLocationId=', activeLocationId);
    }
  }, [loading, locations, activeLocationId]);

  // also log every render with current values so we don't miss a later update
  if (process.env.NODE_ENV === 'development') {
    console.log('[HeaderShopSelector] render -> loading=', loading, 'locations.length=', (locations || []).length, 'activeLocationId=', activeLocationId);
  }

  // Only show the loading placeholder when there are NO locations available.
  // If `locations` is present we show the selector immediately (prevents UI stuck on 'Loading…').
  if (loading && (!locations || locations.length === 0)) {
    console.log('[HeaderShopSelector] loading placeholder — locations.length=', (locations || []).length);
    return (
      <div className="app-topbar-shop">
        <div className="shop-icon"><HiOutlineShoppingBag /></div>
        {isOwner ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-select shop-select" disabled>
              <option>Loading…</option>
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="shop-badge">Loading…</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-topbar-shop">
      <div className="topbar-currency-wrap">
        <button
          className={`topbar-ccy-btn ${currency === 'GHS' ? 'active-ghs' : 'active-usd'}`}
          onClick={toggleCurrency}
          title={currency === 'GHS' ? 'Switch to USD' : 'Switch to GHS'}
        >
          <span className={`topbar-ccy-pill ${currency === 'GHS' ? 'selected' : ''}`}>GHS</span>
          <span className={`topbar-ccy-pill ${currency === 'USD' ? 'selected' : ''}`}>USD</span>
        </button>
        {currency === 'USD' && (
          <div className="topbar-rate-info">
            {rateLoading && <span className="topbar-rate-loading">Fetching…</span>}
            {!rateLoading && rateError && <span className="topbar-rate-error">Rate unavailable</span>}
            {!rateLoading && !rateError && ghsToUsd != null && (
              <span className="topbar-rate-label">
                1 GH₵ = ${ghsToUsd.toFixed(4)}
                {lastUpdated && (
                  <span className="topbar-rate-time"> · {lastUpdated.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shop-icon"><HiOutlineShoppingBag /></div>
      {isOwner ? (
        <select
          className="form-select shop-select"
          value={local || ''}
          onChange={handleChange}
          onClick={() => console.log('[HeaderShopSelector] select clicked', 'loading=', loading, 'locations=', locations)}
          onFocus={handleFocus}
        >
          <option value="">All Shops</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      ) : (
        <div className="shop-badge">{currentShopName()}</div>
      )}
    </div>
  );
}
