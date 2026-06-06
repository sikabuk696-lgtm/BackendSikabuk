import React, { useState, useEffect, useMemo } from 'react';
import { analyticsAPI } from '../../services/api';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ReferenceLine, Legend,
} from 'recharts';
import {
  HiOutlineDocumentReport,
  HiOutlineCurrencyDollar,
  HiOutlineTrendingUp,
  HiOutlineShoppingBag,
  HiOutlineDownload,
} from 'react-icons/hi';
import toast from '../../utils/notify';
import './Reports.css';

const COLOURS = ['#C8962E', '#34A770', '#006B3F', '#D63031', '#8b5cf6', '#E67E22', '#6366f1', '#ec4899'];

export default function ReportsPage() {
  const [range, setRange] = useState('month');
  const [startDate, setStartDate] = useState(getDefaultStart('month'));
  const [endDate, setEndDate] = useState(todayISO());
  const [salesData, setSalesData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { activeLocationId, locations } = useActiveLocation();
  const { currency, ghsToUsd, symbol, formatMoney } = useCurrency();

  function todayISO() { return new Date().toLocaleDateString('en-CA'); } // local YYYY-MM-DD
  function getDefaultStart(r) {
    const d = new Date();
    if (r === 'week') d.setDate(d.getDate() - 7);
    else if (r === 'month') d.setMonth(d.getMonth() - 1);
    else if (r === 'quarter') d.setMonth(d.getMonth() - 3);
    else if (r === 'year') d.setFullYear(d.getFullYear() - 1);
    return d.toLocaleDateString('en-CA'); // local YYYY-MM-DD
  }

  const setPreset = (r) => {
    setRange(r);
    setStartDate(getDefaultStart(r));
    setEndDate(todayISO());
  };


  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = { startDate, endDate };
      if (activeLocationId) params.locationId = activeLocationId;
      const results = await Promise.allSettled([
        analyticsAPI.sales(params),
        analyticsAPI.salesTrend(params),
        analyticsAPI.topProducts(params),
        analyticsAPI.expenses(params),
      ]);

      const salesResult = results[0];
      const trendResult = results[1];
      const topResult = results[2];
      const expResult = results[3];

      if (salesResult.status === 'fulfilled') {
        const rawSales = salesResult.value.data?.analytics || null;
        if (rawSales) {
          // Normalize backend structure to frontend expectation
          setSalesData({
            total_revenue: rawSales.revenue.total,
            total_cost: rawSales.cost.total,
            total_profit: rawSales.profit.total,
            total_sales: rawSales.transactions.total,
            average_sale_value: rawSales.transactions.averageValue,
            total_quantity_sold: rawSales.inventory ? rawSales.inventory.totalQuantity : 0
          });
        } else {
          setSalesData(null);
        }
      }
      
      if (trendResult.status === 'fulfilled') {
        setTrendData(trendResult.value.data?.trend || []);
      }

      if (topResult.status === 'fulfilled') {
        setTopProducts(topResult.value.data?.topProducts || []);
      }

      if (expResult.status === 'fulfilled') {
        setExpenseData(expResult.value.data?.breakdown || []);
      }
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  // Clear stale data immediately when the active shop changes so old numbers
  // don't flash briefly before the new fetch completes.
  useEffect(() => {
    setSalesData(null);
    setTrendData([]);
    setTopProducts([]);
    setExpenseData([]);
    setLoading(true);
  }, [activeLocationId]);

  // fetch when date range or active location changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [startDate, endDate, activeLocationId]);

  /* Computed */
  const profitMargin = salesData
    ? salesData.total_revenue > 0
      ? ((salesData.total_profit / salesData.total_revenue) * 100).toFixed(1)
      : '0.0'
    : '—';

  const totalExpenses = useMemo(() =>
    expenseData.reduce((s, e) => s + Number(e.amount || 0), 0), [expenseData]);

  // 7-day moving average enrichment for trend chart
  const trendDataWithMA = useMemo(() =>
    trendData.map((point, idx, arr) => {
      const start = Math.max(0, idx - 6);
      const slice = arr.slice(start, idx + 1);
      const sum = slice.reduce((s, p) => s + (p.revenue || 0), 0);
      return { ...point, ma7: +(sum / slice.length).toFixed(2) };
    })
  , [trendData]);

  const avgRevenue = useMemo(() =>
    trendData.length
      ? Math.round(trendData.reduce((s, p) => s + (p.revenue || 0), 0) / trendData.length)
      : 0
  , [trendData]);

  const cashFlow = useMemo(() =>
    (salesData?.total_revenue || 0) - totalExpenses
  , [salesData, totalExpenses]);

  const netProfit = salesData ? (salesData.total_profit - totalExpenses) : 0;
  const getStatusMeta = (value, positiveText, negativeText) => {
    if (value > 0) return { label: positiveText, tone: 'positive' };
    if (value < 0) return { label: negativeText, tone: 'negative' };
    return { label: 'Break-even', tone: 'neutral' };
  };
  const netProfitStatus = getStatusMeta(netProfit, 'Profitable', 'Running at a loss');
  const cashFlowStatus = getStatusMeta(cashFlow, 'Cash surplus', 'Cash deficit');
  const activeShopName = activeLocationId
    ? (locations.find(l => l.id === activeLocationId)?.name || 'Shop')
    : 'All Shops';

  const convertAmount = (value) => {
    const amount = Number(value) || 0;
    if (currency !== 'USD' || ghsToUsd == null) return amount;
    return amount * ghsToUsd;
  };

  // Exact same smartNum used in Dashboard
  const smartNum = (val) => {
    const n = convertAmount(val);
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    const locale = currency === 'USD' ? 'en-US' : 'en-GH';
    if (abs >= 1_000_000_000) return { num: sign + (abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 1 : 2), unit: 'B' };
    if (abs >= 1_000_000)     return { num: sign + (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2), unit: 'M' };
    if (abs >= 1_000)         return { num: sign + (abs / 1_000).toFixed(abs >= 10_000 ? 1 : 2), unit: 'K' };
    return { num: n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), unit: '' };
  };

  const kpiParts = (amount) => {
    const { num, unit } = smartNum(Number(amount) || 0);
    const isLong = num.replace('.', '').length > 5;
    return { num, unit, sizeClass: isLong ? 'compact' : '' };
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><HiOutlineDocumentReport style={{ verticalAlign: '-3px' }} /> Reports</h1>
            <p>Financial overview &amp; performance insights</p>
          </div>
          <div>
            <span className={`report-shop-badge ${activeLocationId ? 'single-shop' : 'all-shops'}`}>
              {activeShopName}
            </span>
          </div>
        </div>
      </div>

      {/* Date Range Controls */}
      <div className="report-controls card">
        <div className="preset-btns">
          {['week', 'month', 'quarter', 'year'].map((r) => (
            <button
              key={r}
              className={`btn btn-sm ${range === r ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPreset(r)}
            >
              {r === 'week' ? 'Last 7 days' : r === 'month' ? 'Last 30 days' : r === 'quarter' ? '3 Months' : '1 Year'}
            </button>
          ))}
        </div>
        <div className="date-range-inputs">
          <input type="date" className="form-input" value={startDate}
            onChange={(e) => { setRange('custom'); setStartDate(e.target.value); }} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" className="form-input" value={endDate}
            onChange={(e) => { setRange('custom'); setEndDate(e.target.value); }} />
        </div>
      </div>

      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="report-kpis">

            {/* Revenue */}
            {(() => { const p = kpiParts(salesData?.total_revenue || 0); return (
            <div className="kpi-card revenue">
              <div className="kpi-card-top">
                <span className="kpi-label">Total Revenue</span>
                <span className="kpi-icon-box gold"><HiOutlineCurrencyDollar /></span>
              </div>
              <div className="kpi-amount">
                <span className="sym">{symbol}</span>
                <span className={`num ${p.sizeClass}`}>{p.num}</span>
                {p.unit && <span className="unit">{p.unit}</span>}
              </div>
            </div>); })()}

            {/* Cost */}
            {(() => { const p = kpiParts(salesData?.total_cost || 0); return (
            <div className="kpi-card cost">
              <div className="kpi-card-top">
                <span className="kpi-label">Total Cost</span>
                <span className="kpi-icon-box red"><HiOutlineShoppingBag /></span>
              </div>
              <div className="kpi-amount">
                <span className="sym">{symbol}</span>
                <span className={`num ${p.sizeClass}`}>{p.num}</span>
                {p.unit && <span className="unit">{p.unit}</span>}
              </div>
            </div>); })()}

            {/* Gross Profit */}
            {(() => { const p = kpiParts(salesData?.total_profit || 0); return (
            <div className="kpi-card profit">
              <div className="kpi-card-top">
                <span className="kpi-label">Gross Profit</span>
                <span className="kpi-icon-box green"><HiOutlineTrendingUp /></span>
              </div>
              <div className="kpi-amount">
                <span className="sym">{symbol}</span>
                <span className={`num ${p.sizeClass}`}>{p.num}</span>
                {p.unit && <span className="unit">{p.unit}</span>}
              </div>
              <span className="kpi-sub">{profitMargin}% margin</span>
            </div>); })()}

            {/* Expenses */}
            {(() => { const p = kpiParts(totalExpenses); return (
            <div className="kpi-card expense">
              <div className="kpi-card-top">
                <span className="kpi-label">Expenses</span>
                <span className="kpi-icon-box blue"><HiOutlineDownload /></span>
              </div>
              <div className="kpi-amount">
                <span className="sym">{symbol}</span>
                <span className={`num ${p.sizeClass}`}>{p.num}</span>
                {p.unit && <span className="unit">{p.unit}</span>}
              </div>
            </div>); })()}

            {/* Net Profit */}
            {(() => { const p = kpiParts(netProfit); return (
            <div className="kpi-card highlight net">
              <div className="kpi-card-top">
                <span className="kpi-label">Net Profit</span>
                <span className={`kpi-status ${netProfitStatus.tone}`}>{netProfitStatus.label}</span>
              </div>
              <div className="kpi-amount">
                <span className="sym">{symbol}</span>
                <span className={`num ${p.sizeClass}`}>{p.num}</span>
                {p.unit && <span className="unit">{p.unit}</span>}
              </div>
              <span className="kpi-sub">Revenue &minus; Cost &minus; Expenses</span>
            </div>); })()}

          </div>

          {/* Cash Flow + Sales Summary row */}
          <div className="report-summary-row">
            {(() => { const p = kpiParts(cashFlow); return (
            <div className="kpi-card cashflow report-cashflow-card">
              <div className="kpi-card-top">
                <span className="kpi-label">Cash Flow</span>
                <span className={`kpi-status ${cashFlowStatus.tone}`}>{cashFlowStatus.label}</span>
              </div>
              <div className="kpi-amount">
                <span className="sym">{symbol}</span>
                <span className={`num ${p.sizeClass}`}>{p.num}</span>
                {p.unit && <span className="unit">{p.unit}</span>}
              </div>
              <span className="kpi-sub">Revenue &minus; Expenses</span>
            </div>); })()}

            <div className="card report-summary-card">
              <h3>Sales Summary</h3>
              <div className="summary-grid">
                <div><span className="summary-label">Total Sales</span><span className="summary-val">{salesData?.total_sales ?? 0}</span></div>
                <div><span className="summary-label">Avg Sale</span><span className="summary-val">{formatMoney(salesData?.average_sale_value || 0)}</span></div>
                <div><span className="summary-label">Items Sold</span><span className="summary-val">{salesData?.total_quantity_sold ?? 0}</span></div>
              </div>
            </div>
          </div>

          {/* Charts Row 1: Sales Trend */}
          <div className="card report-chart-card" style={{ marginBottom: 24 }}>
            <h3>Sales Trend</h3>
            {trendData.length === 0 ? (
              <p className="no-chart-data">No data for this period</p>
            ) : (
              <div className="report-chart-inner">
                <ResponsiveContainer width="100%" height={340}>
                  <AreaChart data={trendDataWithMA} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rptGradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C8962E" stopOpacity={0.20} />
                        <stop offset="95%" stopColor="#C8962E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF1" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: '#94A3B8', fontWeight: 600 }}
                      tickFormatter={(d) => d ? +d.slice(8) : d}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94A3B8' }}
                      axisLine={false}
                      tickLine={false}
                      width={50}
                      tickFormatter={(v) => {
                        const converted = convertAmount(v);
                        if (converted >= 1_000_000) return `${(converted / 1_000_000).toFixed(1)}M`;
                        if (converted >= 1_000) return `${(converted / 1_000).toFixed(0)}K`;
                        return converted.toFixed(0);
                      }}
                    />
                    <Tooltip
                      cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }}
                      formatter={(val, name) => [formatMoney(val), name === 'ma7' ? '7-Day Avg' : 'Revenue']}
                      labelFormatter={(d) => {
                        if (!d) return d;
                        const [y, m, day] = d.split('-').map(Number);
                        return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                      }}
                      contentStyle={{ borderRadius: 12, border: '1px solid #E8ECF1', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 13, padding: '10px 14px' }}
                      labelStyle={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}
                    />
                    <ReferenceLine
                      y={avgRevenue}
                      stroke="#94A3B8"
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                      label={{ value: 'Avg', position: 'insideTopRight', fontSize: 11, fill: '#94A3B8' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#C8962E"
                      strokeWidth={3}
                      fill="url(#rptGradRev)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#C8962E', strokeWidth: 0 }}
                      name="Revenue"
                    />
                    <Line
                      type="monotone"
                      dataKey="ma7"
                      stroke="#E67E22"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      name="7-Day Avg"
                    />
                    <Legend
                      iconType="plainline"
                      iconSize={20}
                      wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Charts Row 2: Top Products + Expense Breakdown */}
          <div className="report-row">
            <div className="card report-chart-card">
              <h3>Top Products</h3>
              {topProducts.length === 0 ? (
                <p className="no-chart-data">No data for this period</p>
              ) : (
                <div className="report-chart-inner">
                  {(() => {
                    const maxRev = topProducts[0]?.totalRevenue || 1;
                    const totalRev = topProducts.reduce((s, p) => s + p.totalRevenue, 0) || 1;
                    return (
                      <div className="top-products-list">
                        {topProducts.slice(0, 8).map((p, i) => {
                          const pct = ((p.totalRevenue / totalRev) * 100).toFixed(1);
                          const barW = ((p.totalRevenue / maxRev) * 100).toFixed(1);
                          const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
                          const barColor = COLOURS[i % COLOURS.length];
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
                  })()}
                </div>
              )}
            </div>

            <div className="card report-chart-card expense-breakdown-card">
              <h3>Expense Breakdown</h3>
              {expenseData.length === 0 ? (
                <p className="no-chart-data">No data for this period</p>
              ) : (
                <div className="expense-layout">
                  <div className="expense-donut-wrap">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={expenseData}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={90}
                          paddingAngle={expenseData.length > 1 ? 3 : 0}
                          label={false}
                          strokeWidth={0}
                        >
                          {expenseData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLOURS[index % COLOURS.length]}
                              opacity={0.92}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, name) => [formatMoney(v), name]}
                          contentStyle={{ borderRadius: 10, border: '1px solid #E8ECF1', fontSize: 13, padding: '8px 12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center hole label */}
                    <div className="expense-donut-center">
                      <span className="expense-donut-label">TOTAL</span>
                      <span className="expense-donut-value">{formatMoney(totalExpenses)}</span>
                      {expenseData.length === 1 && (
                        <span className="expense-donut-pct">
                          {(() => { const r = expenseData[0].percentage; const n = typeof r === 'string' ? parseFloat(r) : r; return Number.isFinite(n) ? n.toFixed(1) : '100.0'; })()}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="expense-legend">
                    {expenseData.map((entry, index) => {
                      const rawPct = entry.percentage;
                      const pctNum = typeof rawPct === 'string' ? parseFloat(rawPct) : rawPct;
                      const pctDisplay = Number.isFinite(pctNum) ? pctNum.toFixed(1) : '0.0';
                      return (
                      <div key={entry.category} className="expense-legend-item">
                        <span className="expense-legend-dot" style={{ background: COLOURS[index % COLOURS.length] }} />
                        <span className="expense-legend-name">{entry.category}</span>
                        <div className="expense-legend-bar-wrap">
                          <div className="expense-legend-bar" style={{ width: `${pctNum || 0}%`, background: COLOURS[index % COLOURS.length] }} />
                        </div>
                        <span className="expense-legend-pct">{pctDisplay}%</span>
                        <span className="expense-legend-amount">{formatMoney(entry.amount)}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

