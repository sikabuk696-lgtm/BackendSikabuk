const path = require('path');
const { supabase } = require('../config/supabase');
const config = require('../config/env');

const EXPENSE_ATTACHMENTS_BUCKET = config.supabase.expenseAttachmentsBucket;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const REQUIRED_ATTACHMENT_CATEGORIES = ['bank transfer'];

function categoryRequiresAttachment(category = '') {
  return REQUIRED_ATTACHMENT_CATEGORIES.includes(String(category).trim().toLowerCase());
}

function getAttachmentExtension(file = {}) {
  const originalExtension = path.extname(file.originalname || '').toLowerCase();
  if (originalExtension) {
    return originalExtension;
  }

  switch (file.mimetype) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}

function sanitizeAttachmentName(filename = '') {
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);
  const safeBaseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'proof';

  return `${safeBaseName}${extension.toLowerCase()}`;
}

async function listExpenseAttachments(businessId, expenseId) {
  const folder = `${businessId}/${expenseId}`;
  const { data, error } = await supabase
    .storage
    .from(EXPENSE_ATTACHMENTS_BUCKET)
    .list(folder, {
      limit: 20,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (error) {
    throw error;
  }

  return (data || [])
    .filter((item) => item.name && !item.id?.endsWith('/'))
    .map((item) => ({
      name: item.name,
      path: `${folder}/${item.name}`,
      mimeType: item.metadata?.mimetype || item.metadata?.contentType || null,
      size: item.metadata?.size || item.metadata?.contentLength || null,
      createdAt: item.created_at || null,
      updatedAt: item.updated_at || null,
    }));
}

async function buildAttachmentPayload(businessId, expenseId) {
  try {
    const attachments = await listExpenseAttachments(businessId, expenseId);
    const latestAttachment = attachments[0];
    if (!latestAttachment) {
      return null;
    }

    const { data, error } = await supabase
      .storage
      .from(EXPENSE_ATTACHMENTS_BUCKET)
      .createSignedUrl(latestAttachment.path, SIGNED_URL_TTL_SECONDS);

    if (error) {
      throw error;
    }

    return {
      fileName: latestAttachment.name,
      fileType: latestAttachment.mimeType,
      fileSize: latestAttachment.size,
      path: latestAttachment.path,
      uploadedAt: latestAttachment.createdAt || latestAttachment.updatedAt,
      url: data?.signedUrl || null,
    };
  } catch (error) {
    console.warn(`Unable to read expense attachment for ${expenseId}:`, error.message);
    return null;
  }
}

async function attachExpenseProof(expense) {
  const attachment = await buildAttachmentPayload(expense.business_id, expense.id);
  return {
    ...expense,
    attachment,
  };
}

async function attachExpenseProofs(expenses) {
  return Promise.all((expenses || []).map((expense) => attachExpenseProof(expense)));
}

async function removeExpenseAttachments(businessId, expenseId) {
  try {
    const attachments = await listExpenseAttachments(businessId, expenseId);
    if (!attachments.length) {
      return;
    }

    const { error } = await supabase
      .storage
      .from(EXPENSE_ATTACHMENTS_BUCKET)
      .remove(attachments.map((attachment) => attachment.path));

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn(`Unable to remove expense attachments for ${expenseId}:`, error.message);
  }
}

async function getLatestExpenseAttachment(businessId, expenseId) {
  const attachments = await listExpenseAttachments(businessId, expenseId);
  return attachments[0] || null;
}

async function uploadExpenseAttachment(businessId, expenseId, file) {
  if (!file) {
    return null;
  }

  await removeExpenseAttachments(businessId, expenseId);

  const extension = getAttachmentExtension(file);
  const safeName = sanitizeAttachmentName(file.originalname || `proof${extension}`);
  const storagePath = `${businessId}/${expenseId}/${Date.now()}-${safeName}`;

  const { error } = await supabase
    .storage
    .from(EXPENSE_ATTACHMENTS_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return buildAttachmentPayload(businessId, expenseId);
}

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

    const enrichedExpenses = await attachExpenseProofs(data);

    return {
      success: true,
      expenses: enrichedExpenses,
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

    const enrichedExpense = await attachExpenseProof(data);

    return {
      success: true,
      expense: enrichedExpense
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
async function createExpense(businessId, workerId, expenseData, attachmentFile = null) {
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

    if (categoryRequiresAttachment(category) && !attachmentFile) {
      return {
        success: false,
        error: 'Proof attachment is required for bank transfer expenses'
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

    if (attachmentFile) {
      await uploadExpenseAttachment(businessId, data.id, attachmentFile);
    }

    const enrichedExpense = await attachExpenseProof(data);

    return {
      success: true,
      expense: enrichedExpense
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
async function updateExpense(businessId, workerId, expenseId, updates, attachmentFile = null) {
  try {
    // Check if expense exists and belongs to business
    const existingExpense = await getExpenseById(businessId, expenseId);
    if (!existingExpense.success) {
      return existingExpense;
    }

    // Validate updates
    const allowedFields = ['description', 'amount', 'category', 'expense_date'];
    const updateData = {};
    const removeAttachment = updates.remove_attachment === true || updates.remove_attachment === 'true';

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

    if (Object.keys(updateData).length === 0 && !attachmentFile && !removeAttachment) {
      return {
        success: false,
        error: 'No valid fields to update'
      };
    }

    const nextCategory = updateData.category || existingExpense.expense.category;
    const hasExistingAttachment = Boolean(existingExpense.expense.attachment);
    const willHaveAttachment = Boolean(attachmentFile) || (hasExistingAttachment && !removeAttachment);

    if (categoryRequiresAttachment(nextCategory) && !willHaveAttachment) {
      return {
        success: false,
        error: 'Proof attachment is required for bank transfer expenses'
      };
    }

    let data = existingExpense.expense;

    if (Object.keys(updateData).length > 0) {
      const updateResult = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', expenseId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (updateResult.error) throw updateResult.error;
      data = updateResult.data;
    }

    if (removeAttachment) {
      await removeExpenseAttachments(businessId, expenseId);
    }

    if (attachmentFile) {
      await uploadExpenseAttachment(businessId, expenseId, attachmentFile);
    }

    const enrichedExpense = await attachExpenseProof(data);

    return {
      success: true,
      expense: enrichedExpense
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

    await removeExpenseAttachments(businessId, expenseId);

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

async function getExpenseAttachmentDownload(businessId, expenseId) {
  try {
    const existingExpense = await getExpenseById(businessId, expenseId);
    if (!existingExpense.success) {
      return existingExpense;
    }

    const latestAttachment = await getLatestExpenseAttachment(businessId, expenseId);
    if (!latestAttachment) {
      return {
        success: false,
        error: 'Expense attachment not found'
      };
    }

    const { data, error } = await supabase
      .storage
      .from(EXPENSE_ATTACHMENTS_BUCKET)
      .download(latestAttachment.path);

    if (error) {
      throw error;
    }

    const arrayBuffer = await data.arrayBuffer();

    return {
      success: true,
      fileName: latestAttachment.name,
      fileType: latestAttachment.mimeType || 'application/octet-stream',
      fileBuffer: Buffer.from(arrayBuffer)
    };
  } catch (error) {
    console.error('Error downloading expense attachment:', error);
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
  getExpensesByCategory,
  getExpenseAttachmentDownload
};
