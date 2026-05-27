import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setCurrencyState } from '../utils/currencyState';

const CurrencyContext = createContext();

const normalizeGhsToUsdRate = (rawRate) => {
  const parsedRate = Number(rawRate);
  if (!Number.isFinite(parsedRate) || parsedRate <= 0) return null;

  // For a GHS base, USD should be quoted as a fraction less than 1.
  // If the provider ever returns the inverse quote instead, normalize it.
  return parsedRate > 1 ? 1 / parsedRate : parsedRate;
};

/**
 * Fetches the live GHS → USD exchange rate from a free public API.
 * Falls back gracefully if offline or the API is unavailable.
 */
export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('GHS'); // 'GHS' | 'USD'
  const [ghsToUsd, setGhsToUsd] = useState(null);  // e.g. 0.067 means 1 GHS = $0.067
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchRate = useCallback(async () => {
    setRateLoading(true);
    setRateError(null);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/GHS', { cache: 'no-store' });
      if (!res.ok) throw new Error('Non-OK response');
      const data = await res.json();
      if (data.result === 'success' && data.rates?.USD) {
        const normalizedRate = normalizeGhsToUsdRate(data.rates.USD);
        if (!normalizedRate) throw new Error('Invalid exchange rate');
        setGhsToUsd(normalizedRate);
        setLastUpdated(new Date());
      } else {
        throw new Error('Unexpected payload');
      }
    } catch {
      setRateError('Could not fetch exchange rate.');
    } finally {
      setRateLoading(false);
    }
  }, []);

  // Fetch on mount; auto-refresh every 30 minutes
  useEffect(() => {
    fetchRate();
    const id = setInterval(fetchRate, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchRate]);

  useEffect(() => {
    setCurrencyState({ currency, ghsToUsd });
  }, [currency, ghsToUsd]);

  const toggle = () => setCurrency((c) => (c === 'GHS' ? 'USD' : 'GHS'));

  /** Convert a GHS amount to the active currency. */
  const convert = (ghsAmount) => {
    const n = Number(ghsAmount) || 0;
    if (currency === 'GHS') return n;
    return ghsToUsd != null ? n * ghsToUsd : n;
  };

  /** Format a GHS amount in the active currency. */
  const formatMoney = (ghsAmount) => {
    const n = Number(ghsAmount) || 0;
    if (currency === 'GHS') {
      return `GH\u20B5\u00A0${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const usd = ghsToUsd != null ? n * ghsToUsd : n;
    return `$\u00A0${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const symbol = currency === 'GHS' ? 'GH\u20B5' : '$';

  return (
    <CurrencyContext.Provider
      value={{ currency, ghsToUsd, rateLoading, rateError, lastUpdated, toggle, convert, formatMoney, symbol, refreshRate: fetchRate }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
