const expenseService = require('../services/expenseService');

/**
 * Expense Controller
 * HTTP handlers for expense endpoints
 */

/**
 * GET /api/expenses
 * Get all expenses for the authenticated business
 */
async function getAllExpenses(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate, category } = req.query;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await expenseService.getExpenses(businessId, {
      startDate,
      endDate,
      category,
      locationId
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      expenses: result.expenses,
      count: result.count,
      totalAmount: result.totalAmount
    });
  } catch (error) {
    console.error('Error in getAllExpenses:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/expenses/by-category
 * Get expenses grouped by category
 */
async function getByCategory(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate } = req.query;

    const result = await expenseService.getExpensesByCategory(businessId, { startDate, endDate });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      summary: result.summary
    });
  } catch (error) {
    console.error('Error in getByCategory:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/expenses/:id
 * Get a single expense by ID
 */
async function getExpense(req, res) {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const result = await expenseService.getExpenseById(businessId, id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      expense: result.expense
    });
  } catch (error) {
    console.error('Error in getExpense:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/expenses
 * Create a new expense
 */
async function createExpense(req, res) {
  try {
    const businessId = req.businessId;
    const workerId = req.workerId;
    const expenseData = req.body;

    const result = await expenseService.createExpense(businessId, workerId, expenseData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(201).json({
      success: true,
      expense: result.expense,
      message: 'Expense recorded successfully'
    });
  } catch (error) {
    console.error('Error in createExpense:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * PUT /api/expenses/:id
 * Update an expense
 */
async function updateExpense(req, res) {
  try {
    const businessId = req.businessId;
    const workerId = req.workerId;
    const { id } = req.params;
    const updates = req.body;

    const result = await expenseService.updateExpense(businessId, workerId, id, updates);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      expense: result.expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    console.error('Error in updateExpense:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * DELETE /api/expenses/:id
 * Delete an expense
 */
async function deleteExpense(req, res) {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const result = await expenseService.deleteExpense(businessId, id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error in deleteExpense:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = {
  getAllExpenses,
  getByCategory,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense
};
