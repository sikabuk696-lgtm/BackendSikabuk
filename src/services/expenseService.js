const { supabase } = require('../config/supabase');

/**
 * Expense Service
 * Handles all expense-related business logic with multi-tenant support
 */

/**
 * Get all expenses for a business
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Optional filters (startDate, endDate, category)
 * @returns {Promise<object>} - { success, expenses, count, totalAmount }
 */
async function getExpenses(businessId, filters = {}) {
  try {
    let query = supabase
      .from('expenses')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('expense_date', { ascending: false });

    // optional location filter
    if (filters.locationId) {
      query = query.eq('location_id', filters.locationId);
    }

    // Apply date filters
    if (filters.startDate) {
      query = query.gte('expense_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('expense_date', filters.endDate);
    }

    // Apply category filter
    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Calculate total amount
    const totalAmount = data.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

    return {
      success: true,
      expenses: data,
      count: count,
      totalAmount: totalAmount
    };
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a single expense by ID
 * @param {string} businessId - UUID of the business
 * @param {string} expenseId - UUID of the expense
 * @returns {Promise<object>} - { success, expense }
 */
async function getExpenseById(businessId, expenseId) {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .eq('business_id', businessId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: 'Expense not found'
        };
      }
      throw error;
    }

    return {
      success: true,
      expense: data
    };
  } catch (error) {
    console.error('Error fetching expense:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new expense
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker recording the expense
 * @param {object} expenseData - Expense details
 * @returns {Promise<object>} - { success, expense }
 */
async function createExpense(businessId, workerId, expenseData) {
  try {
    const { description, amount, category, expense_date } = expenseData;

    // Validate required fields
    if (!description || amount === undefined || !category) {
      return {
        success: false,
        error: 'Missing required fields: description, amount, category'
      };
    }

    // Validate amount
    if (amount < 0) {
      return {
        success: false,
        error: 'Amount cannot be negative'
      };
    }

    const newExpense = {
      business_id: businessId,
      user_id: workerId,
      description: description.trim(),
      amount: parseFloat(amount),
      category: category.trim(),
      expense_date: expense_date || new Date().toISOString().split('T')[0],
      location_id: expenseData.location_id || null
    };

    const { data, error } = await supabase
      .from('expenses')
      .insert([newExpense])
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      expense: data
    };
  } catch (error) {
    console.error('Error creating expense:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update an expense
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker updating the expense
 * @param {string} expenseId - UUID of the expense
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} - { success, expense }
 */
async function updateExpense(businessId, workerId, expenseId, updates) {
  try {
    // Check if expense exists and belongs to business
    const existingExpense = await getExpenseById(businessId, expenseId);
    if (!existingExpense.success) {
      return existingExpense;
    }

    // Validate updates
    const allowedFields = ['description', 'amount', 'category', 'expense_date'];
    const updateData = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'description' || field === 'category') {
          updateData[field] = updates[field].trim();
        } else if (field === 'amount') {
          const amount = parseFloat(updates[field]);
          if (amount < 0) {
            return {
              success: false,
              error: 'Amount cannot be negative'
            };
          }
          updateData[field] = amount;
        } else if (field === 'expense_date') {
          updateData[field] = updates[field];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'No valid fields to update'
      };
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', expenseId)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      expense: data
    };
  } catch (error) {
    console.error('Error updating expense:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete an expense
 * @param {string} businessId - UUID of the business
 * @param {string} expenseId - UUID of the expense
 * @returns {Promise<object>} - { success }
 */
async function deleteExpense(businessId, expenseId) {
  try {
    // Check if expense exists and belongs to business
    const existingExpense = await getExpenseById(businessId, expenseId);
    if (!existingExpense.success) {
      return existingExpense;
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('business_id', businessId);

    if (error) throw error;

    return {
      success: true,
      message: 'Expense deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting expense:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get expense summary by category
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Date filters (startDate, endDate)
 * @returns {Promise<object>} - { success, summary }
 */
async function getExpensesByCategory(businessId, filters = {}) {
  try {
    let query = supabase
      .from('expenses')
      .select('category, amount')
      .eq('business_id', businessId);

    if (filters.locationId) {
      query = query.eq('location_id', filters.locationId);
    }

    if (filters.startDate) {
      query = query.gte('expense_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('expense_date', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by category
    const categoryTotals = {};
    data.forEach(expense => {
      const category = expense.category;
      if (!categoryTotals[category]) {
        categoryTotals[category] = 0;
      }
      categoryTotals[category] += parseFloat(expense.amount);
    });

    // Convert to array format
    const summary = Object.entries(categoryTotals).map(([category, total]) => ({
      category,
      total
    })).sort((a, b) => b.total - a.total);

    return {
      success: true,
      summary: summary
    };
  } catch (error) {
    console.error('Error fetching expenses by category:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpensesByCategory
};
