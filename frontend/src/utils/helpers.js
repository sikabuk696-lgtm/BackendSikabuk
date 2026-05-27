import { getCurrencyState } from './currencyState';

export const convertCurrencyAmount = (amount) => {
  const num = Number(amount) || 0;
  const { currency, ghsToUsd } = getCurrencyState();
  if (currency !== 'USD') return num;
  return ghsToUsd != null ? num * ghsToUsd : num;
};

export const getCurrencySymbol = () => (getCurrencyState().currency === 'USD' ? '$' : 'GH\u20B5');

export const getCurrencyCode = () => (getCurrencyState().currency === 'USD' ? 'USD' : 'GHS');

export const formatMoney = (amount) => {
  const { currency } = getCurrencyState();
  const converted = convertCurrencyAmount(amount);
  const locale = currency === 'USD' ? 'en-US' : 'en-GH';
  const symbol = getCurrencySymbol();
  return `${symbol} ${converted.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const cedi = (amount) => formatMoney(amount);

/**
 * Returns currency parts for rich formatting: { symbol: 'GH₵', integer: '1,234', decimal: '.56' }
 */
export const formatCurrencyParts = (amount) => {
  const { currency } = getCurrencyState();
  const num = convertCurrencyAmount(amount);
  const locale = currency === 'USD' ? 'en-US' : 'en-GH';
  const parts = num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return {
    symbol: getCurrencySymbol(),
    integer: parts[0],
    decimal: `.${parts[1]}`
  };
};

export const shortDate = (d) => {
  if (!d) return '—';
  // If we receive a YYYY-MM-DD string, construct a local Date to avoid
  // the browser interpreting it as UTC which can shift the displayed day.
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatDate = (d) => {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
};

export const relativeTime = (d) => {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(d);
};

export const todayISO = () => new Date().toISOString().split('T')[0];

export const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

export const weekStartISO = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
};
