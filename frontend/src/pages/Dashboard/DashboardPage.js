import React, { useState, useEffect, useCallback } from 'react';
import { analyticsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useActiveLocation } from '../../context/ActiveLocationContext';

import { useCurrency } from '../../context/CurrencyContext';
import { convertCurrencyAmount } from '../../utils/helpers';
import {
  HiOutlineCurrencyDollar,
  HiOutlineTrendingUp,
  HiOutlineShoppingCart,
  HiOutlineCube,
  HiOutlineExclamation,
  HiOutlineUsers,
} from 'react-icons/hi';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Line,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine,
} from 'recharts';
import toast from '../../utils/notify';
import './Dashboard.css';

const COLORS = ['#C8962E', '#34A770', '#006B3F', '#D63031', '#8b5cf6', '#E67E22', '#ec4899', '#14b8a6', '#f59e0b'];

export default function DashboardPage() {
  const { isOwner } = useAuth();
  const { activeLocationId, locations } = useActiveLocation();
  const { currency, ghsToUsd, formatMoney, symbol } = useCurrency();
  const [dashboard, setDashboard] = useState(null);
  // derive the active shop name for display (may be undefined if none selected)
  const activeShop = locations.find((l) => l.id === activeLocationId) || {};
  const shopName = activeShop.name || '';
  const [trend, setTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState([]);
  const [salesByHour, setSalesByHour] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const today = now.toLocaleDateString('en-CA');   // local YYYY-MM-DD
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toLocaleDateString('en-CA');                  // local first-of-month

      const params = { startDate: monthStart, endDate: today };
      if (activeLocationId) params.locationId = activeLocationId;
      const dashParams = {};
      if (activeLocationId) dashParams.locationId = activeLocationId;
      const [dashRes, trendRes, topRes, byHourRes] = await Promise.all([
        analyticsAPI.dashboard(dashParams),
        analyticsAPI.salesTrend(params),
        analyticsAPI.topProducts({ ...params, limit: 5 }),
        analyticsAPI.salesByHour(params),
      ]);

      setDashboard(dashRes.data.dashboard);
      setTrend(trendRes.data.trend || []);
      setTopProducts(topRes.data.topProducts || []);
      setSalesByHour(byHourRes.data.hours || []);

      // Expense breakdown (owner only)
      if (isOwner) {
        try {
          const expParams = { startDate: monthStart, endDate: today };
          if (activeLocationId) expParams.locationId = activeLocationId;
          const expRes = await analyticsAPI.expenses(expParams);
          setExpenseBreakdown(expRes.data.breakdown || []);
        } catch { /* ignore if no expenses */ }
      }
    } catch (err) {
      console.error('Dashboard error:', err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [activeLocationId, isOwner]);

  // Clear stale data immediately when the shop selector changes so old numbers
  // don't show for one render frame before the new fetch starts.
  useEffect(() => {
    setDashboard(null);
    setTrend([]);
    setTopProducts([]);
    setExpenseBreakdown([]);
    setSalesByHour([]);
    setLoading(true);
  }, [activeLocationId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="loading-inline">
        <div className="spinner" />
      </div>
    );
  }

  const d = dashboard || {};
  const today = d.today || {};
  const month = d.thisMonth || {};
  const alerts = d.alerts || {};

  // 7-day moving average for trend (adds `ma7` property)
  const trendWithMA = trend.map((point, idx, arr) => {
    const window = 7;
    const start = Math.max(0, idx - window + 1);
    const slice = arr.slice(start, idx + 1);
    const sum = slice.reduce((s, p) => s + (p.revenue || 0), 0);
    return { ...point, ma7: +(sum / slice.length).toFixed(2) };
  });

  // sparkline data (last 7 days)
  const sparklineData = trendWithMA.slice(-7).map((p) => ({ date: p.date, revenue: p.revenue || 0 }));

  const avgRevenue = trendWithMA.length
    ? Math.round(trendWithMA.reduce((s, p) => s + (p.revenue || 0), 0) / trendWithMA.length)
    : 0;

  // Smart compact number: 1,250,000 → { num: '1.25', unit: 'M' }
  const smartNum = (val) => {
    const n = Number(val) || 0;
    if (n >= 1_000_000) return { num: (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2), unit: 'M' };
    if (n >= 1_000)     return { num: (n / 1_000).toFixed(n >= 10_000 ? 1 : 2), unit: 'K' };
    return { num: n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), unit: '' };
  };

  const StatNumber = ({ value, color }) => {
    const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    const converted = currency === 'USD' && ghsToUsd != null ? safeValue * ghsToUsd : safeValue;
    const { num, unit } = smartNum(converted);
    const isLong = num.replace('.','').length > 5;
    return (
      <div className="stat-amount">
        <span className="sym">{symbol}</span>
        <span className={`num ${isLong ? 'compact' : ''}`} style={color ? { color } : {}}>{num}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
    );
  };

  const TrendBadge = ({ current, prev }) => {
    if (!prev || prev === 0) return null;
    const pct = (((current - prev) / prev) * 100).toFixed(1);
    const up = pct >= 0;
    return <span className={`stat-badge ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%</span>;
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' });
  const heroTitle = isOwner
    ? (activeLocationId
      ? `Akwaaba, ${shopName}. Let us turn today into growth.`
      : 'Akwaaba. Your business pulse is live and ready for action.')
    : 'Akwaaba. Let us make today count.';
  const heroSubtitle = activeLocationId
    ? `${dateStr}. Focused view for ${shopName}. Track sales, profit and stock in real time.`
    : `${dateStr}. Full business view across every shop. Spot opportunities and act with confidence.`;

  return (
    <div className="dashboard">
      {/* Hero Banner */}
      <div className="dashboard-hero">
        <div className="hero-greeting">
          <h1>{heroTitle}</h1>
          <p>{heroSubtitle}</p>
        </div>

        <div className="hero-right">
          <div className="hero-live-badge">
            <span className="hero-live-dot" />
            Live • {timeStr}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        {/* Today Revenue */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">Today’s Revenue</span>
            <span className="stat-icon-box gold"><HiOutlineCurrencyDollar /></span>
          </div>
          <StatNumber value={today.revenue} color="#006B3F" />
          <div className="stat-footer">
            <span className="stat-sub">{today.transactions || 0} transactions</span>
            {sparklineData.length > 1 && (
              <div style={{ width: 80, height: 28 }}>
                <ResponsiveContainer width="100%" height={28}>
                  <AreaChart data={sparklineData} margin={{}}>  
                    <Area dataKey="revenue" stroke="#C8962E" strokeWidth={1.5} fill="rgba(200,150,46,0.1)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Today Profit */}
        <div className="stat-card green-top">
          <div className="stat-card-top">
            <span className="stat-card-label">Today’s Profit</span>
            <span className="stat-icon-box green"><HiOutlineTrendingUp /></span>
          </div>
          <StatNumber 
            value={today.netProfit != null ? today.netProfit : (today.revenue - today.cost - (today.expenses || 0))} 
            color={(today.netProfit != null ? today.netProfit : (today.revenue - today.cost - (today.expenses || 0))) >= 0 ? '#006B3F' : '#D63031'}
          />
          <div className="stat-footer">
            <span className="stat-sub">After expenses</span>
            <TrendBadge current={today.netProfit || 0} prev={month.netProfit ? month.netProfit / 30 : 0} />
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="stat-card blue-top">
          <div className="stat-card-top">
            <span className="stat-card-label">Monthly Revenue</span>
            <span className="stat-icon-box blue"><HiOutlineShoppingCart /></span>
          </div>
          <StatNumber value={month.revenue} color="#006B3F" />
          <div className="stat-footer">
            <span className="stat-sub">{month.transactions || 0} sales this month</span>
            <TrendBadge current={month.revenue || 0} prev={today.revenue ? today.revenue * 30 * 0.85 : 0} />
          </div>
        </div>

        {/* Low Stock */}
        <div className="stat-card orange-top">
          <div className="stat-card-top">
            <span className="stat-card-label">Low Stock Items</span>
            <span className="stat-icon-box orange"><HiOutlineCube /></span>
          </div>
          <div className="stat-amount">
            <span className={`num ${(alerts.lowStockProducts || 0) > 9 ? 'compact' : ''}`} style={{ color: (alerts.lowStockProducts || 0) > 0 ? '#D63031' : '#0F172A' }}>
              {alerts.lowStockProducts || 0}
            </span>
          </div>
          <div className="stat-footer">
            <span className="stat-sub">Need restocking</span>
            {(alerts.lowStockProducts || 0) > 0 && <span className="stat-badge down">⚠ Action</span>}
          </div>
        </div>
      </div>

      {/* Alert Cards */}
      {(alerts.lowStockProducts > 0 || alerts.totalDebt > 0) && (
        <div className="alert-strip">
          {alerts.lowStockProducts > 0 && (
            <div className="alert-card warning">
              <HiOutlineExclamation />
              <span><strong>{alerts.lowStockProducts}</strong>{alerts.lowStockProducts === 1 ? ' product is running low on stock' : ' products are running low on stock'}</span>
            </div>
          )}
          {alerts.totalDebt > 0 && (
            <div className="alert-card info">
              <HiOutlineUsers />
              <span>
                <strong>{alerts.customersWithDebt}</strong>
                {alerts.customersWithDebt === 1 ? ' customer owes ' : ' customers owe '}
                {formatMoney(alerts.totalDebt)} in outstanding debt
              </span>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="dashboard-charts">
        {/* Sales Trend */}
        <div className="card chart-card">
          <div className="card-header">
            <h2>Sales Trend (This Month)</h2>
          </div>
          <div className="card-body">
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendWithMA} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C8962E" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#C8962E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => d ? +d.slice(8) : d}
                    tick={{ fontSize: 12, fill: '#9CA3AF', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v) =>
                      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1_000 ? `${(convertCurrencyAmount(v) / 1_000).toFixed(0)}K`
                        : convertCurrencyAmount(v).toFixed(0)
                    }
                  />
                  <Tooltip
                    cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }}
                    formatter={(val, name) => [formatMoney(val), name === 'ma7' ? '7-Day Avg' : 'Revenue']}
                    labelFormatter={(d) => {
                      if (!d) return d;
                      const [year, month, day] = d.split('-').map(Number);
                      return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                    }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E6E9EE', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 13, padding: '10px 14px' }}
                    labelStyle={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}
                  />
                  <ReferenceLine
                    y={avgRevenue}
                    stroke="#94A3B8"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{ value: 'Avg', position: 'insideTopRight', fontSize: 11, fill: '#94A3B8' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#C8962E" strokeWidth={3} fill="url(#colorRev)" dot={false} activeDot={{ r: 5, fill: '#C8962E', strokeWidth: 0 }} name="Revenue" />
                  <Line type="monotone" dataKey="ma7" stroke="#E67E22" strokeWidth={2} strokeDasharray="6 3" dot={false} name="7-Day Avg" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <h3>No sales data yet</h3>
                <p>Start recording sales to see your trend chart</p>
              </div>
            )}
          </div>
        </div>

        {/* LEFT: Sales by Hour (large) */}
        <div className="card chart-card">
          <div className="card-header">
            <h2>Sales by Hour (heatmap)</h2>
          </div>
          <div className="card-body">
            {salesByHour && salesByHour.length ? (
              <div>
                <div className="heatmap-grid">
                  {salesByHour.map((h) => {
                    const max = Math.max(...salesByHour.map((s) => s.revenue || 0));
                    const intensity = max > 0 ? Math.round((h.revenue / max) * 9) : 0;
                    const bg = `rgba(214,48,49, ${0.07 + (intensity / 10)})`;
                    return (
                      <div key={h.hour} className="heatmap-cell" title={`${h.hour}:00 — ${formatMoney(h.revenue || 0)}`} style={{ background: bg }}>
                        <div className="heatmap-hour">{h.hour}</div>
                        <div className="heatmap-val">{Math.round(convertCurrencyAmount(h.revenue || 0))}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>Darker = more revenue this hour</div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No hourly sales data</p>
            )}
          </div>
        </div>

        {/* RIGHT: Top Products */}
        <div className="card chart-card">
          <div className="card-header">
            <h2>Top Products</h2>
          </div>
          <div className="card-body">
            {topProducts.length > 0 ? (() => {
              const maxRev = topProducts[0]?.totalRevenue || 1;
              const totalRev = topProducts.reduce((s, p) => s + p.totalRevenue, 0) || 1;
              return (
                <div className="top-products-list">
                  {topProducts.slice(0, 7).map((p, i) => {
                    const pct = ((p.totalRevenue / totalRev) * 100).toFixed(1);
                    const barW = ((p.totalRevenue / maxRev) * 100).toFixed(1);
                    const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
                    const barColor = COLORS[i % COLORS.length];
                    return (
                      <div key={p.productId || i} className="tp-row">
                        <div className={`tp-rank ${rankClass}`}>{i + 1}</div>
                        <div className="tp-mid">
                          <span className="tp-name">{p.name}</span>
                          <span className="tp-meta">{p.totalQuantity} units &middot; {p.transactionCount} {p.transactionCount === 1 ? 'sale' : 'sales'}</span>
                          <div className="tp-bar-track">
                            <div className="tp-bar-fill" style={{ width: `${barW}%`, background: barColor }} />
                          </div>
                        </div>
                        <div className="tp-revenue">
                          <div className="tp-rev-amount">{formatMoney(p.totalRevenue)}</div>
                          <div className="tp-rev-pct">{pct}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <div className="empty-state">
                <div className="empty-icon">🏆</div>
                <h3>No product data yet</h3>
                <p>Sales data will populate your top products</p>
              </div>
            )}
          </div>
        </div>

        {/* Expense Breakdown (Moved into grid) */}
        <div className="card chart-card">
          <div className="card-header">
            <h2>Expense Breakdown</h2>
          </div>
          <div className="card-body">
            {isOwner ? (
                expenseBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        paddingAngle={3}
                        label={false}
                      >
                        {expenseBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => formatMoney(val)} contentStyle={{ borderRadius: 8, fontSize: 13 }} itemStyle={{ color: '#111827' }} />
                      <Legend 
                        layout="vertical" 
                        verticalAlign="middle" 
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#4B5563' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">💸</div>
                    <h3>No expenses yet</h3>
                    <p>Track expenses to see a breakdown here</p>
                  </div>
                )
            ) : (
                <div className="empty-state">
                  <div className="empty-icon">🔒</div>
                  <h3>Restricted Access</h3>
                  <p>Only business owners can view expense breakdowns</p>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
