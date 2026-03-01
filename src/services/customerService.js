const { supabase } = require('../config/supabase');

/**
 * Customer Service
 * Handles all customer-related business logic with multi-tenant support
 */

/**
 * Get all customers for a business
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Optional filters (search, hasDebt)
 * @returns {Promise<object>} - { success, customers, count }
 */
async function getCustomers(businessId, filters = {}) {
  try {
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (filters.locationId) {
      query = query.eq('location_id', filters.locationId);
    }

    // Apply search filter
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    }

    // Apply debt filter
    if (filters.hasDebt === 'true' || filters.hasDebt === true) {
      query = query.gt('total_debt', 0);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      success: true,
      customers: data,
      count: count
    };
  } catch (error) {
    console.error('Error fetching customers:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a single customer by ID
 * @param {string} businessId - UUID of the business
 * @param {string} customerId - UUID of the customer
 * @returns {Promise<object>} - { success, customer }
 */
async function getCustomerById(businessId, customerId) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: 'Customer not found'
        };
      }
      throw error;
    }

    return {
      success: true,
      customer: data
    };
  } catch (error) {
    console.error('Error fetching customer:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new customer
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker creating the customer
 * @param {object} customerData - Customer details
 * @returns {Promise<object>} - { success, customer }
 */
async function createCustomer(businessId, workerId, customerData) {
  try {
    const { name, phone, total_debt, location_id } = customerData;

    // Validate required fields
    if (!name) {
      return {
        success: false,
        error: 'Customer name is required'
      };
    }

    // Validate phone if provided
    if (phone && phone.length > 15) {
      return {
        success: false,
        error: 'Phone number too long (max 15 characters)'
      };
    }

    // Validate debt
    if (total_debt !== undefined && total_debt < 0) {
      return {
        success: false,
        error: 'Debt cannot be negative'
      };
    }

    const newCustomer = {
      business_id: businessId,
      user_id: workerId,
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      total_debt: total_debt !== undefined ? parseFloat(total_debt) : 0,
      location_id: location_id || null
    };

    const { data, error } = await supabase
      .from('customers')
      .insert([newCustomer])
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      customer: data
    };
  } catch (error) {
    console.error('Error creating customer:', error);
    const msg = (error && error.message) ? error.message : String(error);
    if (/column .* does not exist/i.test(msg) || msg.includes("Could not find the 'updated_by' column")) {
      return { success: false, error: 'Database schema missing columns — run `database/00_clean_recreate_schema_oauth_ready.sql`.' };
    }
    return {
      success: false,
      error: msg
    };
  }
}

/**
 * Update a customer
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker updating the customer
 * @param {string} customerId - UUID of the customer
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} - { success, customer }
 */
async function updateCustomer(businessId, workerId, customerId, updates) {
  try {
    // Check if customer exists and belongs to business
    const existingCustomer = await getCustomerById(businessId, customerId);
    if (!existingCustomer.success) {
      return existingCustomer;
    }

    // Validate updates
    const allowedFields = ['name', 'phone', 'total_debt', 'location_id'];
    const updateData = { updated_by: workerId };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'name') {
          updateData[field] = updates[field].trim();
        } else if (field === 'phone') {
          const phone = updates[field] ? updates[field].trim() : null;
          if (phone && phone.length > 15) {
            return {
              success: false,
              error: 'Phone number too long (max 15 characters)'
            };
          }
          updateData[field] = phone;
        } else if (field === 'total_debt') {
          const debt = parseFloat(updates[field]);
          if (debt < 0) {
            return {
              success: false,
              error: 'Debt cannot be negative'
            };
          }
          updateData[field] = debt;
        }
      }
    }

    // Try updating with `updated_by`, fall back if column missing
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', customerId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, customer: data };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (/column .* does not exist/i.test(msg) || msg.includes("Could not find the 'updated_by' column")) {
        const { data: data2, error: err2 } = await supabase
          .from('customers')
          .update(Object.fromEntries(Object.entries(updateData).filter(([k]) => k !== 'updated_by')))
          .eq('id', customerId)
          .eq('business_id', businessId)
          .select()
          .single();
        if (err2) throw err2;
        return { success: true, customer: data2 };
      }
      throw err;
    }
  } catch (error) {
    console.error('Error updating customer:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a customer
 * @param {string} businessId - UUID of the business
 * @param {string} customerId - UUID of the customer
 * @returns {Promise<object>} - { success }
 */
async function deleteCustomer(businessId, customerId) {
  try {
    // Check if customer exists and belongs to business
    const existingCustomer = await getCustomerById(businessId, customerId);
    if (!existingCustomer.success) {
      return existingCustomer;
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('business_id', businessId);

    if (error) throw error;

    return {
      success: true,
      message: 'Customer deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting customer:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get customers with debt
 * @param {string} businessId - UUID of the business
 * @returns {Promise<object>} - { success, customers, totalDebt }
 */
async function getCustomersWithDebt(businessId, locationId = null) {
  try {
    let query = supabase
      .from('customers')
      .select('*')
      .eq('business_id', businessId)
      .gt('total_debt', 0);
    if (locationId) {
      query = query.eq('location_id', locationId);
    }
    query = query.order('total_debt', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    const totalDebt = data.reduce((sum, customer) => sum + parseFloat(customer.total_debt), 0);

    return {
      success: true,
      customers: data,
      totalDebt: totalDebt
    };
  } catch (error) {
    console.error('Error fetching customers with debt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update customer debt
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker
 * @param {string} customerId - UUID of the customer
 * @param {number} debtChange - Amount to add (positive) or remove (negative)
 * @returns {Promise<object>} - { success, customer }
 */
async function adjustCustomerDebt(businessId, workerId, customerId, debtChange) {
  try {
    const existingCustomer = await getCustomerById(businessId, customerId);
    if (!existingCustomer.success) {
      return existingCustomer;
    }

    const newDebt = parseFloat(existingCustomer.customer.total_debt) + debtChange;

    if (newDebt < 0) {
      return {
        success: false,
        error: 'Debt cannot be negative'
      };
    }

    // Try updating debt with `updated_by`, fall back if column missing
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ total_debt: newDebt, updated_by: workerId })
        .eq('id', customerId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, customer: data };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (/column .* does not exist/i.test(msg) || msg.includes("Could not find the 'updated_by' column")) {
        const { data: data2, error: err2 } = await supabase
          .from('customers')
          .update({ total_debt: newDebt })
          .eq('id', customerId)
          .eq('business_id', businessId)
          .select()
          .single();
        if (err2) throw err2;
        return { success: true, customer: data2 };
      }
      throw err;
    }
  } catch (error) {
    console.error('Error adjusting customer debt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomersWithDebt,
  adjustCustomerDebt
};
