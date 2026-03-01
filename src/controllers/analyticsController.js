const analyticsService = require('../services/analyticsService');

/**
 * Analytics Controller
 * HTTP handlers for analytics and dashboard endpoints
 */

/**
 * GET /api/analytics/dashboard
 * Get complete dashboard overview (today, week, month stats)
 */
async function getDashboard(req, res) {
  try {
    const businessId = req.businessId;
    const locationId = req.effectiveLocationId || req.query.locationId || null; // optional: show a single shop

    const result = await analyticsService.getDashboardOverview(businessId, locationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      dashboard: result.dashboard
    });
  } catch (error) {
    console.error('Error in getDashboard:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/analytics/sales
 * Get detailed sales analytics with profit calculations
 */
async function getSalesAnalytics(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate } = req.query;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const result = await analyticsService.getSalesAnalytics(businessId, startDate, endDate, locationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      analytics: result.analytics
    });
  } catch (error) {
    console.error('Error in getSalesAnalytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/analytics/top-products
 * Get best selling products
 */
async function getTopProducts(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate, limit } = req.query;

    const locationId = req.effectiveLocationId || req.query.locationId || null;
    const result = await analyticsService.getTopProducts(
      businessId,
      startDate,
      endDate,
      limit ? parseInt(limit, 10) : 10,
      locationId
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      topProducts: result.topProducts
    });
  } catch (error) {
    console.error('Error in getTopProducts:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/analytics/sales-trend
 * Get daily sales trend
 */
async function getSalesTrend(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const locationId = req.effectiveLocationId || req.query.locationId || null;
    const result = await analyticsService.getSalesTrend(businessId, startDate, endDate, locationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      trend: result.trend
    });
  } catch (error) {
    console.error('Error in getSalesTrend:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/analytics/sales-by-hour
 * Get sales aggregated by hour (0-23) for a period
 */
async function getSalesByHour(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }

    const locationId = req.effectiveLocationId || req.query.locationId || null;
    const result = await analyticsService.getSalesByHour(businessId, startDate, endDate, locationId);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });

    return res.status(200).json({ success: true, hours: result.hours });
  } catch (error) {
    console.error('Error in getSalesByHour:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/analytics/expenses
 * Get expense breakdown by category
 */
async function getExpenseBreakdown(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate } = req.query;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await analyticsService.getExpenseBreakdown(businessId, startDate, endDate, locationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      breakdown: result.breakdown,
      totalExpenses: result.totalExpenses
    });
  } catch (error) {
    console.error('Error in getExpenseBreakdown:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = {
  getDashboard,
  getSalesAnalytics,
  getTopProducts,
  getSalesTrend,
  getSalesByHour,
  getExpenseBreakdown
};
