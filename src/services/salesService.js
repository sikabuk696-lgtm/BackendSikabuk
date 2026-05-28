const { supabase } = require('../config/supabase');

/**
 * Sales Service
 * Handles all sales-related business logic with multi-tenant support
 * Manages product inventory and customer debt automatically
 */

/**
 * Get all sales for a business
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Optional filters (startDate, endDate, customerId, productId, paymentStatus)
 * @returns {Promise<object>} - { success, sales, count, totalRevenue }
 */
async function getSales(businessId, filters = {}) {
  try {
    let query = supabase
      .from('sales')
      .select(`
        *,
        products:product_id (id, name, selling_price),
        customers:customer_id (id, name, phone)
      `, { count: 'exact' })
      .eq('business_id', businessId)
      .order('sale_date', { ascending: false });

    // Apply location filter (optional)
    if (filters.locationId) {
      query = query.eq('location_id', filters.locationId);
    }

    // Apply date filters
    if (filters.startDate) {
      query = query.gte('sale_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('sale_date', filters.endDate);
    }

    // Apply customer filter
    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    // Apply product filter
    if (filters.productId) {
      query = query.eq('product_id', filters.productId);
    }

    // Apply payment status filter
    if (filters.paymentStatus) {
      query = query.eq('payment_status', filters.paymentStatus);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Calculate total revenue
    const totalRevenue = data.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0);

    return {
      success: true,
      sales: data,
      count: count,
      totalRevenue: totalRevenue
    };
  } catch (error) {
    console.error('Error fetching sales:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a single sale by ID
 * @param {string} businessId - UUID of the business
 * @param {string} saleId - UUID of the sale
 * @returns {Promise<object>} - { success, sale }
 */
async function getSaleById(businessId, saleId) {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        products:product_id (id, name, cost_price, selling_price),
        customers:customer_id (id, name, phone, total_debt)
      `)
      .eq('id', saleId)
      .eq('business_id', businessId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: 'Sale not found'
        };
      }
      throw error;
    }

    return {
      success: true,
      sale: data
    };
  } catch (error) {
    console.error('Error fetching sale:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new sale
 * Automatically updates product quantity and customer debt
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker recording the sale
 * @param {object} saleData - Sale details
 * @returns {Promise<object>} - { success, sale }
 */
async function createSale(businessId, workerId, saleData) {
  try {
    const {
      product_id,
      customer_id,
      quantity,
      unit_price,
      payment_type,
      payment_status,
      sale_date
    } = saleData;

    // Validate required fields
    if (!product_id || !quantity || unit_price === undefined || !payment_type || !payment_status) {
      return {
        success: false,
        error: 'Missing required fields'
      };
    }

    // Validate quantity
    if (quantity <= 0) {
      return {
        success: false,
        error: 'Quantity must be greater than zero'
      };
    }

    // Validate unit price
    if (unit_price < 0) {
      return {
        success: false,
        error: 'Unit price cannot be negative'
      };
    }

    // Validate payment type
    if (!['cash', 'credit'].includes(payment_type)) {
      return {
        success: false,
        error: 'Payment type must be either cash or credit'
      };
    }

    // Validate payment status
    if (!['paid', 'pending'].includes(payment_status)) {
      return {
        success: false,
        error: 'Payment status must be either paid or pending'
      };
    }

    // For credit sales, customer_id is required
    if (payment_type === 'credit' && !customer_id) {
      return {
        success: false,
        error: 'Customer is required for credit sales'
      };
    }

    // Check if product exists and has sufficient stock
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, quantity, selling_price')
      .eq('id', product_id)
      .eq('business_id', businessId)
      .single();

    if (productError || !product) {
      return {
        success: false,
        error: 'Product not found'
      };
    }

    if (product.quantity < quantity) {
      return {
        success: false,
        error: `Insufficient stock. Available: ${product.quantity}`
      };
    }

    // Calculate total amount
    const total_amount = parseFloat(unit_price) * parseInt(quantity, 10);

    // Fetch business timezone (if set) to compute local dates correctly
    let bizTimezone = null;
    try {
      const { data: biz } = await supabase
        .from('business_accounts')
        .select('timezone')
        .eq('id', businessId)
        .single();
      bizTimezone = biz?.timezone || null;
    } catch (err) {
      // ignore - we'll fall back to client-provided or server local date
      bizTimezone = null;
    }

    // Prefer client-provided sale_date (YYYY-MM-DD). Validate format; if missing/falsy use business timezone (if available) or server local date.
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let saleDate = null;

    if (sale_date && isoDateRegex.test(String(sale_date))) {
      saleDate = sale_date;
    } else if (sale_date) {
      // attempt to parse and reformat (fallback)
      const parsed = new Date(sale_date);
      if (!Number.isNaN(parsed.getTime())) {
        saleDate = parsed.toISOString().split('T')[0];
      }
    }

    if (!saleDate) {
      // Use business timezone if available, otherwise server local date
      try {
        if (bizTimezone) {
          saleDate = new Date().toLocaleDateString('en-CA', { timeZone: bizTimezone });
        } else {
          saleDate = new Date().toLocaleDateString('en-CA');
        }
      } catch (err) {
        saleDate = new Date().toLocaleDateString('en-CA');
      }
    }

    // Get or create daily batch for this sale
    // Check if there's an unapproved batch for this date, otherwise create a new one
    // If a location is provided, prefer site-specific daily_batch; otherwise default to business-wide batch
    const targetLocationId = saleData.location_id || null;

    // IMPORTANT: Supabase JS .eq('uuid_col', null) emits `col=null` which Postgres
    // rejects with "invalid input syntax for type uuid: 'null'".
    // Use .is('location_id', null) for the NULL case.
    let batchQuery = supabase
      .from('daily_batches')
      .select('id')
      .eq('business_id', businessId)
      .eq('batch_date', saleDate)
      .eq('approved', false);

    if (targetLocationId) {
      batchQuery = batchQuery.eq('location_id', targetLocationId);
    } else {
      batchQuery = batchQuery.is('location_id', null);
    }

    let { data: existingBatch, error: batchCheckError } = await batchQuery.single();

    let batchId;
    
    if (batchCheckError && batchCheckError.code === 'PGRST116') {
      // No unapproved batch exists, create a new one
      const { data: newBatch, error: createError } = await supabase
        .from('daily_batches')
        .insert({
          business_id: businessId,
          batch_date: saleDate,
          location_id: targetLocationId
        })
        .select('id')
        .single();
      
      if (createError) {
        return {
          success: false,
          error: 'Failed to create daily batch: ' + createError.message
        };
      }
      
      batchId = newBatch.id;
    } else if (existingBatch) {
      batchId = existingBatch.id;
    } else {
      return {
        success: false,
        error: 'Failed to check daily batch: ' + batchCheckError.message
      };
    }

    // Start transaction-like operations
    // 1. Create the sale with batch assignment
    const newSale = {
      business_id: businessId,
      user_id: workerId,
      product_id,
      customer_id: customer_id || null,
      quantity: parseInt(quantity, 10),
      unit_price: parseFloat(unit_price),
      total_amount,
      payment_type,
      payment_status,
      sale_date: saleDate,
      batch_id: batchId,
      location_id: saleData.location_id || null
    };

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert([newSale])
      .select()
      .single();

    if (saleError) throw saleError;

    // 2. Update product quantity
    // Update product quantity (try with `updated_by`, fall back if column missing)
    let updateProductError = null;
    try {
      const { error } = await supabase
        .from('products')
        .update({
          quantity: product.quantity - parseInt(quantity, 10),
          updated_by: workerId
        })
        .eq('id', product_id)
        .eq('business_id', businessId);
      updateProductError = error;
      if (updateProductError) throw updateProductError;
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (/column .*does not exist/i.test(msg) || /Could not find the 'updated_by' column/i.test(msg) || /column .* does not exist/i.test(msg)) {
        // retry without updated_by
        const { error: retryErr } = await supabase
          .from('products')
          .update({ quantity: product.quantity - parseInt(quantity, 10) })
          .eq('id', product_id)
          .eq('business_id', businessId);
        updateProductError = retryErr;
      } else {
        updateProductError = err;
      }
    }

    if (updateProductError) {
      // Rollback: delete the sale
      await supabase.from('sales').delete().eq('id', sale.id);
      throw updateProductError;
    }

    // 3. If credit sale and payment is pending, update customer debt
    if (payment_type === 'credit' && payment_status === 'pending' && customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('total_debt')
        .eq('id', customer_id)
        .eq('business_id', businessId)
        .single();

      if (customer) {
        // Try updating customer debt with updated_by, fall back if column missing
        try {
          const { error: updateCustomerErr } = await supabase
            .from('customers')
            .update({
              total_debt: parseFloat(customer.total_debt) + total_amount,
              updated_by: workerId
            })
            .eq('id', customer_id)
            .eq('business_id', businessId);
          if (updateCustomerErr) throw updateCustomerErr;
        } catch (err) {
          const msg = (err && err.message) ? err.message : String(err);
          if (/column .* does not exist/i.test(msg) || /Could not find the 'updated_by' column/i.test(msg)) {
            await supabase
              .from('customers')
              .update({ total_debt: parseFloat(customer.total_debt) + total_amount })
              .eq('id', customer_id)
              .eq('business_id', businessId);
          } else {
            throw err;
          }
        }
      }
    }

    return {
      success: true,
      sale: sale
    };
  } catch (error) {
    console.error('Error creating sale:', error);
    const msg = (error && error.message) ? error.message : String(error);
    if (msg.includes("Could not find the 'updated_by' column") || /column .* does not exist/i.test(msg)) {
      return {
        success: false,
        error: 'Database schema mismatch — missing columns. Run `database/00_clean_recreate_schema_oauth_ready.sql` to apply required columns and triggers.'
      };
    }
    return {
      success: false,
      error: msg
    };
  }
}

/**
 * Update sale payment status
 * Used to mark credit sales as paid
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker
 * @param {string} saleId - UUID of the sale
 * @param {string} newStatus - New payment status ('paid' or 'pending')
 * @returns {Promise<object>} - { success, sale }
 */
async function updateSalePaymentStatus(businessId, workerId, saleId, newStatus) {
  try {
    // Validate status
    if (!['paid', 'pending'].includes(newStatus)) {
      return {
        success: false,
        error: 'Invalid payment status'
      };
    }

    // Get the sale
    const saleResult = await getSaleById(businessId, saleId);
    if (!saleResult.success) {
      return saleResult;
    }

    const sale = saleResult.sale;

    // Check if the batch is approved (prevent modifications to approved batches)
    if (sale.batch_id) {
      const canModify = await canModifyBatch(sale.batch_id);
      if (!canModify) {
        return {
          success: false,
          error: 'Cannot modify sales in an approved batch'
        };
      }
    }

    // If changing from pending to paid for credit sales, reduce customer debt
    if (
      sale.payment_status === 'pending' &&
      newStatus === 'paid' &&
      sale.payment_type === 'credit' &&
      sale.customer_id
    ) {
      const { data: customer } = await supabase
        .from('customers')
        .select('total_debt')
        .eq('id', sale.customer_id)
        .eq('business_id', businessId)
        .single();

      if (customer) {
        const newDebt = Math.max(0, parseFloat(customer.total_debt) - parseFloat(sale.total_amount));
        await supabase
          .from('customers')
          .update({
            total_debt: newDebt,
            updated_by: workerId
          })
          .eq('id', sale.customer_id)
          .eq('business_id', businessId);
      }
    }

    // If changing from paid to pending for credit sales, increase customer debt
    if (
      sale.payment_status === 'paid' &&
      newStatus === 'pending' &&
      sale.payment_type === 'credit' &&
      sale.customer_id
    ) {
      const { data: customer } = await supabase
        .from('customers')
        .select('total_debt')
        .eq('id', sale.customer_id)
        .eq('business_id', businessId)
        .single();

      if (customer) {
        await supabase
          .from('customers')
          .update({
            total_debt: parseFloat(customer.total_debt) + parseFloat(sale.total_amount),
            updated_by: workerId
          })
          .eq('id', sale.customer_id)
          .eq('business_id', businessId);
      }
    }

    // Update the sale
    const { data, error } = await supabase
      .from('sales')
      .update({ payment_status: newStatus })
      .eq('id', saleId)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      sale: data
    };
  } catch (error) {
    console.error('Error updating sale payment status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get sales summary/analytics
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Date filters (startDate, endDate)
 * @returns {Promise<object>} - { success, summary }
 */
async function getSalesSummary(businessId, filters = {}) {
  try {
    let query = supabase
      .from('sales')
      .select('*')
      .eq('business_id', businessId);

    if (filters.startDate) {
      query = query.gte('sale_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('sale_date', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    const summary = {
      totalSales: data.length,
      totalRevenue: data.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0),
      cashSales: data.filter(s => s.payment_type === 'cash').length,
      creditSales: data.filter(s => s.payment_type === 'credit').length,
      paidSales: data.filter(s => s.payment_status === 'paid').length,
      pendingSales: data.filter(s => s.payment_status === 'pending').length,
      pendingAmount: data
        .filter(s => s.payment_status === 'pending')
        .reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0)
    };

    return {
      success: true,
      summary
    };
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get daily batches for a business
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Optional filters (startDate, endDate, approved)
 * @returns {Promise<object>} - { success, batches }
 */
async function getDailyBatches(businessId, filters = {}) {
  try {
    let query = supabase
      .from('daily_batches')
      .select('*, locations:location_id (id, name), approver:workers!approved_by (id, worker_name)')
      .eq('business_id', businessId)
      .order('batch_date', { ascending: false });

    // location filter (optional)
    if (filters.locationId) {
      query = query.eq('location_id', filters.locationId);
    }

    if (filters.startDate) {
      query = query.gte('batch_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('batch_date', filters.endDate);
    }
    if (filters.approved !== undefined) {
      query = query.eq('approved', filters.approved);
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      batches: data
    };
  } catch (error) {
    console.error('Error fetching daily batches:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get sales for a specific daily batch
 * @param {string} businessId - UUID of the business
 * @param {string} batchId - UUID of the batch
 * @returns {Promise<object>} - { success, batch, sales }
 */
async function getBatchDetails(businessId, batchId) {
  try {
    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('daily_batches')
      .select('*, approver:workers!approved_by (id, worker_name)')
      .eq('id', batchId)
      .eq('business_id', businessId)
      .single();

    if (batchError || !batch) {
      return {
        success: false,
        error: 'Batch not found'
      };
    }

    // Get sales in this batch
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select(`
        *,
        products:product_id (id, name, selling_price),
        customers:customer_id (id, name, phone)
      `)
      .eq('batch_id', batchId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });

    if (salesError) throw salesError;

    // Also include business timezone so front-end can display times consistently
    let businessTimezone = null;
    try {
      const { data: biz } = await supabase
        .from('business_accounts')
        .select('timezone')
        .eq('id', businessId)
        .single();
      businessTimezone = biz?.timezone || null;
    } catch (err) {
      businessTimezone = null;
    }

    // attach timezone to returned batch object
    const batchWithTz = { ...batch, business_timezone: businessTimezone };

    // Compute a timezone-correct local sale date for each sale without changing DB values.
    // Uses Intl.DateTimeFormat with the business timezone to produce YYYY-MM-DD.
    const salesWithLocalDate = (sales || []).map((s) => {
      const sale = { ...s };
      try {
        if (businessTimezone && sale.created_at) {
          const dt = new Date(sale.created_at);
          const local = new Intl.DateTimeFormat('en-CA', {
            timeZone: businessTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit'
          }).format(dt);
          sale.local_sale_date = local; // format: YYYY-MM-DD
        } else if (sale.sale_date) {
          // fallback to stored sale_date
          sale.local_sale_date = (typeof sale.sale_date === 'string') ? sale.sale_date : new Date(sale.sale_date).toISOString().slice(0,10);
        } else {
          sale.local_sale_date = null;
        }
      } catch (err) {
        sale.local_sale_date = sale.sale_date || null;
      }
      return sale;
    });

    return {
      success: true,
      batch: batchWithTz,
      sales: salesWithLocalDate
    };
  } catch (error) {
    console.error('Error fetching batch details:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Approve a daily batch (owner only)
 * @param {string} businessId - UUID of the business
 * @param {string} batchId - UUID of the batch
 * @param {string} ownerId - UUID of the approving owner
 * @returns {Promise<object>} - { success, message }
 */
async function approveDailyBatch(businessId, batchId, ownerId) {
  try {
    // Verify batch exists and belongs to business
    const { data: batch, error: batchError } = await supabase
      .from('daily_batches')
      .select('id, approved, batch_date')
      .eq('id', batchId)
      .eq('business_id', businessId)
      .single();

    if (batchError || !batch) {
      return {
        success: false,
        error: 'Batch not found'
      };
    }

    if (batch.approved) {
      return {
        success: false,
        error: 'Batch is already approved'
      };
    }

    // Approve the batch
    const { error: updateError } = await supabase
      .from('daily_batches')
      .update({
        approved: true,
        approved_by: ownerId,
        approved_at: new Date().toISOString()
      })
      .eq('id', batchId)
      .eq('business_id', businessId);

    if (updateError) throw updateError;

    return {
      success: true,
      batchDate: batch.batch_date,
      message: `Daily sales for ${batch.batch_date} have been approved`
    };
  } catch (error) {
    console.error('Error approving batch:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if a batch can be modified (not approved)
 * @param {string} batchId - UUID of the batch
 * @returns {Promise<boolean>} - true if batch can be modified
 */
async function canModifyBatch(batchId) {
  try {
    const { data: batch, error } = await supabase
      .from('daily_batches')
      .select('approved')
      .eq('id', batchId)
      .single();

    if (error || !batch) {
      return false;
    }

    return !batch.approved;
  } catch (error) {
    console.error('Error checking batch modification permission:', error);
    return false;
  }
}

module.exports = {
  getSales,
  getSaleById,
  createSale,
  updateSalePaymentStatus,
  getSalesSummary,
  getDailyBatches,
  getBatchDetails,
  approveDailyBatch,
  canModifyBatch
};
