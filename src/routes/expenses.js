const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middleware/auth');
const { canManageExpenses } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

/**
 * Expense Routes
 * All routes require authentication and are scoped to the business
 * ⚠️ OWNER ONLY - Workers cannot manage expenses
 * Only the business owner/CEO can view, create, update, or delete expenses
 */

// Apply authentication middleware to all expense routes
router.use(authenticate);
router.use(canManageExpenses);

// GET /api/expenses - Get all expenses (with optional filters)
router.get('/', expenseController.getAllExpenses);

// GET /api/expenses/by-category - Get expenses grouped by category
router.get('/by-category', expenseController.getByCategory);

// GET /api/expenses/:id - Get a single expense
router.get('/:id', validateParam('id'), expenseController.getExpense);

// POST /api/expenses - Create a new expense
router.post('/', expenseController.createExpense);

// PUT /api/expenses/:id - Update an expense
router.put('/:id', validateParam('id'), expenseController.updateExpense);

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', validateParam('id'), expenseController.deleteExpense);

module.exports = router;
