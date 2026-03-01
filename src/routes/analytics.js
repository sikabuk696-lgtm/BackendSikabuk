const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { workerOrOwner } = require('../middleware/permissions');

/**
 * Analytics Routes
 * All routes require authentication
 * Both owners and workers can view analytics
 */

// Apply authentication middleware
router.use(authenticate);
router.use(workerOrOwner);

// GET /api/analytics/dashboard - Complete dashboard (today, week, month)
router.get('/dashboard', analyticsController.getDashboard);

// GET /api/analytics/sales - Detailed sales analytics with profit
router.get('/sales', analyticsController.getSalesAnalytics);

// GET /api/analytics/top-products - Best selling products
router.get('/top-products', analyticsController.getTopProducts);

// GET /api/analytics/sales-trend - Daily sales trend
router.get('/sales-trend', analyticsController.getSalesTrend);

// GET /api/analytics/expenses - Expense breakdown by category
router.get('/expenses', analyticsController.getExpenseBreakdown);

// GET /api/analytics/sales-by-hour - Sales aggregated by hour for a period
router.get('/sales-by-hour', analyticsController.getSalesByHour);

module.exports = router;
