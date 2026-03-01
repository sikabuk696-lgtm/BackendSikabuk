const { supabase } = require('../config/supabase');

// Helper: derive a sale's local YYYY-MM-DD date using business timezone or fallback

// Helper: augment a Supabase query with location filtering, including
// rows where `location_id` IS NULL if the selected shop should include the
// "default"/main location.  We treat a location as default if either:
// 1. its name (case-insensitive) is 'main'
// 2. it is the earliest-created location for the business (migration target)
// This mirrors the behaviour used by the existing reports endpoints.

// UUID v4 pattern used to validate locationId before string interpolation into
// PostgREST filter expressions (prevents injection via crafted locationId values)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function applyLocationFilter(query, businessId, locationId) {
  if (!locationId) return query;

  // Reject anything that isn't a properly-formed UUID to prevent PostgREST
  // filter injection (e.g. locationId containing commas or parentheses)
  if (!UUID_REGEX.test(locationId)) {
    console.warn('[applyLocationFilter] invalid locationId rejected:', locationId);
    return query; // ignore the filter rather than throwing to avoid crashing analytics
  }

  // Strict per-shop filter: only return rows explicitly tagged to this location.
  // "All Shops" is represented by locationId = null (no filter applied above).
  // Historical rows with location_id = NULL are intentionally excluded from
  // per-shop views — they appear only under "All Shops".
  return query.eq('location_id', locationId);
}
// Behavior: trust `sale.sale_date` whenever it is present and looks like YYYY-MM-DD — the
// frontend now always sends the correct client-local date on every sale creation/edit.
// Only fall back to deriving from `created_at` (with business timezone) when `sale_date`
// is absent or malformed (e.g. very old rows before the field existed).
function localSaleDateFor(sale, businessTimezone) {
  if (!sale) return null;
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

  // Primary: trust the stored sale_date — it is set from the client's local clock
  if (sale.sale_date && typeof sale.sale_date === 'string' && isoDateRegex.test(sale.sale_date)) {
    return sale.sale_date;
  }

  // Fallback: derive from created_at using business timezone (handles legacy rows without sale_date)
  const src = sale.created_at || sale.sale_date;
  if (!src) return null;
  const dt = new Date(src);
  try {
    if (businessTimezone) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: businessTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
    }
    return dt.toISOString().slice(0, 10);
  } catch (err) {
    return dt.toISOString().slice(0, 10);
  }
}

/**
 * Analytics Service
 * Provides comprehensive business analytics including:
 * - Sales analytics (revenue, profit, trends)
 * - Product performance
 * - Customer insights
 * - Expense tracking
 * - Time-based comparisons (today, week, month)
 */

/**
 * Get dashboard overview
 * @param {string} businessId - UUID of the business
 * @returns {Promise<object>} - Complete dashboard statistics
 */
async function getDashboardOverview(businessId, locationId = null) {
  try {
    // Fetch business timezone first so all date boundaries use local time
    const { data: biz } = await supabase
      .from('business_accounts')
      .select('business_name, timezone')
      .eq('id', businessId)
      .single();
    const tz = biz?.timezone || null;

    const today = getLocalDateString(tz);
    const startOfWeek = getStartOfWeek(tz);
    const startOfMonth = getStartOfMonth(tz);


    // For each interval we can reuse the existing sales analytics helper which
    // already handles location filtering and error propagation.  This keeps the
    // dashboard code synced with the reports logic and ensures we don't silently
    // swallow any query errors.
    const todayRes = await getSalesAnalytics(businessId, today, today, locationId);
    if (!todayRes.success) throw new Error(todayRes.error || 'failed to fetch today stats');
    const weekRes = await getSalesAnalytics(businessId, startOfWeek, today, locationId);
    if (!weekRes.success) throw new Error(weekRes.error || 'failed to fetch week stats');
    const monthRes = await getSalesAnalytics(businessId, startOfMonth, today, locationId);
    if (!monthRes.success) throw new Error(monthRes.error || 'failed to fetch month stats');

    // convert analytics output format to the shape previously returned by
    // getStatsForPeriod so the UI doesn't have to change
    const normalize = (res) => ({
      revenue: res.analytics.revenue.total,
      cost: res.analytics.cost.total,
      grossProfit: res.analytics.profit.total,
      expenses: 0, // expenses handled separately in dashboard
      netProfit: res.analytics.profit.total,
      transactions: res.analytics.transactions.total,
      itemsSold: res.analytics.inventory.totalQuantity
    });

    const todayStats = normalize(todayRes);
    const weekStats = normalize(weekRes);
    const monthStats = normalize(monthRes);

    // Get low stock products count (products where quantity <= low_stock_alert)
    // Products are global/shared across shops - intentionally not filtered by locationId
    let lowStockQuery = supabase
      .from('products')
      .select('quantity, low_stock_alert')
      .eq('business_id', businessId);
    const { data: allProducts } = await lowStockQuery;

    const lowStockCount = allProducts?.filter(p => p.quantity <= p.low_stock_alert).length || 0;

    // Get total customers with debt (filtered by location if one is selected)
    let debtQuery = supabase
      .from('customers')
      .select('total_debt')
      .eq('business_id', businessId)
      .gt('total_debt', 0);
    if (locationId) {
      debtQuery = debtQuery.eq('location_id', locationId);
    }
    const { data: debtCustomers } = await debtQuery;

    const totalDebt = debtCustomers?.reduce((sum, c) => sum + parseFloat(c.total_debt), 0) || 0;

    // Get pending sales amount (filtered by location if one is selected)
    let pendingQuery = supabase
      .from('sales')
      .select('total_amount')
      .eq('business_id', businessId)
      .eq('payment_status', 'pending');
    if (locationId) {
      pendingQuery = await applyLocationFilter(pendingQuery, businessId, locationId);
    }
    const { data: pendingSales } = await pendingQuery;

    const pendingAmount = pendingSales?.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0) || 0;

    return {
      success: true,
      dashboard: {
        businessName: biz?.business_name || null,
        businessTimezone: biz?.timezone || null,
        today: todayStats,
        thisWeek: weekStats,
        thisMonth: monthStats,
        alerts: {
          lowStockProducts: lowStockCount || 0,
          totalDebt: totalDebt,
          pendingSales: pendingAmount,
          customersWithDebt: debtCustomers?.length || 0
        }
      }
    };
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get detailed sales analytics for a period
 * (resilient to incorrect `sale_date` by deriving business-local date from created_at)
 */
async function getSalesAnalytics(businessId, startDate, endDate, locationId = null) {
  try {
    // Fetch business timezone
    const { data: biz } = await supabase
      .from('business_accounts')
      .select('timezone')
      .eq('id', businessId)
      .single();
    const tz = biz?.timezone || null;

    // Expand created_at window to account for timezone shifts
    const startDt = new Date(startDate);
    startDt.setDate(startDt.getDate() - 1);
    const endDt = new Date(endDate);
    endDt.setDate(endDt.getDate() + 1);

    let salesQuery = supabase
      .from('sales')
      .select(`
        *,
        products:product_id (cost_price, selling_price)
      `)
      .eq('business_id', businessId)
      .gte('created_at', startDt.toISOString())
      .lte('created_at', endDt.toISOString());

    if (locationId) {
      salesQuery = await applyLocationFilter(salesQuery, businessId, locationId);
    }

    const { data: rawSales, error } = await salesQuery;

    if (error) throw error;

    // Only include sales whose business-local date falls within the requested period
    const sales = (rawSales || []).filter((s) => {
      const local = localSaleDateFor(s, tz);
      return local && local >= startDate && local <= endDate;
    });

    // Calculate metrics
    let totalRevenue = 0;
    let totalCost = 0;
    let totalQuantity = 0;
    let cashSales = 0;
    let creditSales = 0;
    let paidAmount = 0;
    let pendingAmount = 0;

    sales.forEach(sale => {
      const revenue = parseFloat(sale.total_amount) || 0;
      const quantity = parseInt(sale.quantity || 0, 10) || 0;
      const cost = (parseFloat(sale.products?.cost_price || 0) || 0) * quantity;
      
      totalRevenue += revenue;
      totalCost += cost;
      totalQuantity += quantity;

      if (sale.payment_type === 'cash') {
        cashSales += revenue;
      } else {
        creditSales += revenue;
      }

      if (sale.payment_status === 'paid') {
        paidAmount += revenue;
      } else {
        pendingAmount += revenue;
      }
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    return {
      success: true,
      analytics: {
        period: { startDate, endDate },
        revenue: {
          total: totalRevenue,
          cash: cashSales,
          credit: creditSales,
          paid: paidAmount,
          pending: pendingAmount
        },
        cost: {
          total: totalCost
        },
        profit: {
          total: totalProfit,
          margin: profitMargin.toFixed(2) + '%'
        },
        inventory: {
          totalQuantity: totalQuantity
        },
        transactions: {
          total: sales.length,
          averageValue: sales.length > 0 ? (totalRevenue / sales.length) : 0
        }
      }
    };
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get top selling products
 * @param {string} businessId - UUID of the business
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 * @param {number} limit - Number of products to return
 * @returns {Promise<object>} - Top products by revenue and quantity
 */
async function getTopProducts(businessId, startDate = null, endDate = null, limit = 10, locationId = null) {
  try {
    // Use created_at window and derive business-local date so products aren't omitted when sale_date is wrong
    const { data: biz } = await supabase
      .from('business_accounts')
      .select('timezone')
      .eq('id', businessId)
      .single();
    const tz = biz?.timezone || null;

    const startDt = startDate ? new Date(startDate) : null;
    const endDt = endDate ? new Date(endDate) : null;
    if (startDt) startDt.setDate(startDt.getDate() - 1);
    if (endDt) endDt.setDate(endDt.getDate() + 1);

    let query = supabase
      .from('sales')
      .select(`
        product_id,
        quantity,
        total_amount,
        created_at,
        updated_at,
        sale_date,
        location_id,
        products:product_id (name, selling_price)
      `)
      .eq('business_id', businessId);

    if (startDt) query = query.gte('created_at', startDt.toISOString());
    if (endDt) query = query.lte('created_at', endDt.toISOString());
    if (locationId) {
      query = await applyLocationFilter(query, businessId, locationId);
    }

    const { data: rawSales, error } = await query;
    if (error) throw error;

    const sales = (rawSales || []).filter((s) => {
      if (!startDate || !endDate) return true;
      const local = localSaleDateFor(s, tz);
      return local && local >= startDate && local <= endDate;
    });

    // Group by product
    const productStats = {};
    sales.forEach(sale => {
      const productId = sale.product_id;
      if (!productStats[productId]) {
        productStats[productId] = {
          productId,
          name: sale.products?.name || 'Unknown',
          totalQuantity: 0,
          totalRevenue: 0,
          transactionCount: 0
        };
      }
      productStats[productId].totalQuantity += parseInt(sale.quantity || 0, 10);
      productStats[productId].totalRevenue += parseFloat(sale.total_amount || 0);
      productStats[productId].transactionCount += 1;
    });

    // Convert to array and sort by revenue
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);

    return {
      success: true,
      topProducts
    };
  } catch (error) {
    console.error('Error fetching top products:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get sales trend by day for a period
 * @param {string} businessId - UUID of the business
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<object>} - Daily sales trend
 */
async function getSalesTrend(businessId, startDate, endDate, locationId = null) {
  try {
    // Fetch business timezone
    const { data: biz } = await supabase
      .from('business_accounts')
      .select('timezone')
      .eq('id', businessId)
      .single();
    const tz = biz?.timezone || null;

    // Expand created_at window to account for timezone shifts
    const startDt = new Date(startDate);
    startDt.setDate(startDt.getDate() - 1);
    const endDt = new Date(endDate);
    endDt.setDate(endDt.getDate() + 1);

    let query = supabase
      .from('sales')
      .select('sale_date, total_amount, quantity, created_at, updated_at, location_id, products:product_id (cost_price)')
      .eq('business_id', businessId)
      .gte('created_at', startDt.toISOString())
      .lte('created_at', endDt.toISOString())
      .order('sale_date', { ascending: true });

    if (locationId) {
      query = await applyLocationFilter(query, businessId, locationId);
    }

    const { data: rawSales, error } = await query;

    if (error) throw error;

    // Group by derived local date
    const dailyStats = {};
    (rawSales || []).forEach(sale => {
      const date = localSaleDateFor(sale, tz);
      if (!date) return;
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          revenue: 0,
          cost: 0,
          transactions: 0,
          itemsSold: 0
        };
      }
      const revenue = parseFloat(sale.total_amount || 0);
      const unitCost = parseFloat(sale.products?.cost_price || 0) || 0;
      const cost = unitCost * (parseInt(sale.quantity || 0, 10) || 0);

      dailyStats[date].revenue += revenue;
      dailyStats[date].cost += cost;
      dailyStats[date].transactions += 1;
      dailyStats[date].itemsSold += parseInt(sale.quantity || 0, 10);
    });

    // compute profit per day (revenue - cost)
    const trend = Object.values(dailyStats)
      .filter(t => t.date >= startDate && t.date <= endDate)
      .map((t) => ({
        ...t,
        profit: +(t.revenue - t.cost)
      }));

    return {
      success: true,
      trend
    };
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get sales aggregated by hour (0-23) for a period
 */
async function getSalesByHour(businessId, startDate, endDate, locationId = null) {
  try {
    // Fetch business timezone and expand created_at window to be resilient to sale_date drift
    const { data: biz } = await supabase
      .from('business_accounts')
      .select('timezone')
      .eq('id', businessId)
      .single();
    const tz = biz?.timezone || null;

    const startDt = new Date(startDate);
    startDt.setDate(startDt.getDate() - 1);
    const endDt = new Date(endDate);
    endDt.setDate(endDt.getDate() + 1);

    let q = supabase
      .from('sales')
      .select('created_at, total_amount, sale_date, updated_at, location_id')
      .eq('business_id', businessId)
      .gte('created_at', startDt.toISOString())
      .lte('created_at', endDt.toISOString());

    // Use applyLocationFilter (same as other analytics methods) so that
    // the main/first shop correctly includes null-location_id rows.
    if (locationId) {
      q = await applyLocationFilter(q, businessId, locationId);
    }

    const { data: rawSales, error } = await q;

    if (error) throw error;

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0, count: 0 }));

    (rawSales || []).forEach(sale => {
      const local = localSaleDateFor(sale, tz);
      if (!local || local < startDate || local > endDate) return; // ignore outside requested local day
      const dt = new Date(sale.created_at);
      const hour = dt.getHours();
      hours[hour].revenue += parseFloat(sale.total_amount || 0);
      hours[hour].count += 1;
    });

    return { success: true, hours };
  } catch (error) {
    console.error('Error fetching sales by hour:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get expense breakdown by category
 * @param {string} businessId - UUID of the business
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 * @returns {Promise<object>} - Expenses grouped by category
 */
async function getExpenseBreakdown(businessId, startDate = null, endDate = null, locationId = null) {
  try {
    let query = supabase
      .from('expenses')
      .select('category, amount, expense_date, location_id')
      .eq('business_id', businessId);

    if (locationId) query = query.eq('location_id', locationId);
    if (startDate) query = query.gte('expense_date', startDate);
    if (endDate) query = query.lte('expense_date', endDate);

    const { data: expenses, error } = await query;
    if (error) throw error;

    // Group by category
    const categoryTotals = {};
    let totalExpenses = 0;

    expenses.forEach(expense => {
      const category = expense.category;
      const amount = parseFloat(expense.amount);
      
      if (!categoryTotals[category]) {
        categoryTotals[category] = 0;
      }
      categoryTotals[category] += amount;
      totalExpenses += amount;
    });

    // Convert to array with percentages
    const breakdown = Object.entries(categoryTotals).map(([category, amount]) => ({
      category,
      amount,
      percentage: ((amount / totalExpenses) * 100).toFixed(2) + '%'
    })).sort((a, b) => b.amount - a.amount);

    return {
      success: true,
      breakdown,
      totalExpenses
    };
  } catch (error) {
    console.error('Error fetching expense breakdown:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper: Get stats for a specific period
 *
 * NOTE: some historical `sale_date` values may be incorrect due to UTC/local bugs.
 * To make analytics resilient we derive each sale's business-local date (preferring
 * stored `sale_date` when present) using `created_at` + business timezone and
 * include sales whose local date falls inside the requested window.
 */
async function getStatsForPeriod(businessId, startDate, endDate, locationId = null) {
  // Fetch business timezone (optional)
  const { data: biz } = await supabase
    .from('business_accounts')
    .select('timezone')
    .eq('id', businessId)
    .single();
  const tz = biz?.timezone || null;


  // Expand created_at window by one day on each side to account for timezone shifts
  const startDt = new Date(startDate);
  startDt.setDate(startDt.getDate() - 1);
  const endDt = new Date(endDate);
  endDt.setDate(endDt.getDate() + 1);

  let salesQuery = supabase
    .from('sales')
    .select(`
      total_amount,
      quantity,
      created_at,
      updated_at,
      sale_date,
      location_id,
      products:product_id (cost_price)
    `)
    .eq('business_id', businessId)
    .gte('created_at', startDt.toISOString())
    .lte('created_at', endDt.toISOString());

  if (locationId) {
    salesQuery = await applyLocationFilter(salesQuery, businessId, locationId);
  }

  const { data: sales } = await salesQuery;

  // Get expenses for exact period (filter by location if requested)
  let expenseQuery = supabase
    .from('expenses')
    .select('amount')
    .eq('business_id', businessId);
  if (locationId) {
    expenseQuery = await applyLocationFilter(expenseQuery, businessId, locationId);
  }
  expenseQuery = expenseQuery
    .gte('expense_date', startDate)
    .lte('expense_date', endDate);
  const { data: expenses } = await expenseQuery;

  // Filter sales by their business-local date (derived)
  const filteredSales = (sales || []).filter((s) => {
    const local = localSaleDateFor(s, tz);
    return local && local >= startDate && local <= endDate;
  });

  const totalRevenue = filteredSales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
  const totalCost = filteredSales.reduce((sum, s) => 
    sum + ((parseFloat(s.products?.cost_price || 0) || 0) * (parseInt(s.quantity || 0, 10) || 0)), 0);
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const netProfit = totalProfit - totalExpenses;

  return {
    revenue: totalRevenue,
    cost: totalCost,
    grossProfit: totalProfit,
    expenses: totalExpenses,
    netProfit: netProfit,
    transactions: filteredSales.length || 0,
    itemsSold: filteredSales.reduce((sum, s) => sum + (parseInt(s.quantity || 0, 10) || 0), 0) || 0
  };
}

/**
 * Helper: Get today's date as YYYY-MM-DD in the given timezone (or UTC if none).
 */
function getLocalDateString(tz) {
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (_) { /* fall through */ }
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Helper: Get start of current week (Monday) as YYYY-MM-DD in local timezone.
 */
function getStartOfWeek(tz) {
  const todayStr = getLocalDateString(tz);
  // Parse as midnight UTC so arithmetic is simple and produces YYYY-MM-DD parts
  const today = new Date(todayStr + 'T00:00:00Z');
  const day = today.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // days back to Monday
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

/**
 * Helper: Get start of current month as YYYY-MM-DD in local timezone.
 */
function getStartOfMonth(tz) {
  const todayStr = getLocalDateString(tz);
  return todayStr.slice(0, 8) + '01'; // YYYY-MM-01
}

module.exports = {
  getDashboardOverview,
  getSalesAnalytics,
  getTopProducts,
  getSalesTrend,
  getSalesByHour,
  getExpenseBreakdown
};
