const { supabase } = require('../config/supabase');

/**
 * Product Service
 * Handles all product-related business logic with multi-tenant support
 * All operations are scoped to the business_id from the authenticated user
 */

/**
 * Get all products for a business
 * @param {string} businessId - UUID of the business
 * @param {object} filters - Optional filters (search, lowStock)
 * @returns {Promise<object>} - { success, products, count }
 */
async function getProducts(businessId, filters = {}) {
  try {
    // Prefer ordering by `added_at` if present, fall back to `created_at` if column missing
    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId);
    try {
      query = query.order('added_at', { ascending: false });
    } catch (err) {
      query = query.order('created_at', { ascending: false });
    }

    // Apply search filter
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    // Note: low-stock filter (quantity <= low_stock_alert) cannot be expressed as a
    // column-to-column comparison through the Supabase JS v2 PostgREST builder, so we
    // apply it in JavaScript after fetching.
    const applyLowStockFilter = filters.lowStock === 'true' || filters.lowStock === true;

    const { data, error, count } = await query;

    if (error) throw error;

    const products = applyLowStockFilter
      ? data.filter(p => parseInt(p.quantity, 10) <= parseInt(p.low_stock_alert, 10))
      : data;

    return {
      success: true,
      products,
      count: applyLowStockFilter ? products.length : count
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a single product by ID
 * @param {string} businessId - UUID of the business
 * @param {string} productId - UUID of the product
 * @returns {Promise<object>} - { success, product }
 */
async function getProductById(businessId, productId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('business_id', businessId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: 'Product not found'
        };
      }
      throw error;
    }

    return {
      success: true,
      product: data
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new product
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker creating the product
 * @param {object} productData - Product details
 * @returns {Promise<object>} - { success, product }
 */
async function createProduct(businessId, workerId, productData) {
  try {
    const { name, cost_price, selling_price, quantity, low_stock_alert } = productData;

    // Validate required fields
    if (!name || cost_price === undefined || selling_price === undefined) {
      return {
        success: false,
        error: 'Missing required fields: name, cost_price, selling_price'
      };
    }

    const parsedCost = parseFloat(cost_price);
    const parsedSell = parseFloat(selling_price);
    // Validate prices (must be numeric and non-negative)
    if (!Number.isFinite(parsedCost) || !Number.isFinite(parsedSell)) {
      return {
        success: false,
        error: 'Prices must be valid numbers'
      };
    }
    if (parsedCost < 0 || parsedSell < 0) {
      return {
        success: false,
        error: 'Prices cannot be negative'
      };
    }

    // Validate quantity
    if (quantity !== undefined && quantity < 0) {
      return {
        success: false,
        error: 'Quantity cannot be negative'
      };
    }

    const parsedQty = quantity !== undefined ? parseInt(quantity, 10) : 0;
    const parsedLow = low_stock_alert !== undefined ? parseInt(low_stock_alert, 10) : 10;

    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      return { success: false, error: 'Quantity must be a non-negative integer' };
    }
    if (!Number.isFinite(parsedLow) || parsedLow < 0) {
      return { success: false, error: 'Low stock alert must be a non-negative integer' };
    }

    const newProduct = {
      business_id: businessId,
      user_id: workerId,  // Using worker_id as user_id
      name: name.trim(),
      cost_price: parsedCost,
      selling_price: parsedSell,
      quantity: parsedQty,
      low_stock_alert: parsedLow
    };

    // If frontend provided a location_id (active shop), set it on the product
    if (productData.location_id) {
      newProduct.location_id = productData.location_id;
    }

    const { data, error } = await supabase
      .from('products')
      .insert([newProduct])
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      product: data
    };
  } catch (error) {
    console.error('Error creating product:', error);
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
 * Update a product
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker updating the product
 * @param {string} productId - UUID of the product
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} - { success, product }
 */
async function updateProduct(businessId, workerId, productId, updates) {
  try {
    // Check if product exists and belongs to business
    const existingProduct = await getProductById(businessId, productId);
    if (!existingProduct.success) {
      return existingProduct;
    }

    // Validate updates
    const allowedFields = ['name', 'cost_price', 'selling_price', 'quantity', 'low_stock_alert'];
    const updateData = { updated_by: workerId };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'name') {
          updateData[field] = updates[field].trim();
        } else if (field === 'cost_price' || field === 'selling_price') {
          const price = parseFloat(updates[field]);
          if (price < 0) {
            return {
              success: false,
              error: `${field} cannot be negative`
            };
          }
          updateData[field] = price;
        } else {
          const value = parseInt(updates[field], 10);
          if (value < 0) {
            return {
              success: false,
              error: `${field} cannot be negative`
            };
          }
          updateData[field] = value;
        }
      }
    }

    // Try updating with `updated_by`, fall back if column missing
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', productId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        product: data
      };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (/column .* does not exist/i.test(msg) || msg.includes("Could not find the 'updated_by' column")) {
        // retry without updated_by
        const { data: data2, error: err2 } = await supabase
          .from('products')
          .update(Object.fromEntries(Object.entries(updateData).filter(([k]) => k !== 'updated_by')))
          .eq('id', productId)
          .eq('business_id', businessId)
          .select()
          .single();
        if (err2) throw err2;
        return { success: true, product: data2 };
      }
      throw err;
    }
  } catch (error) {
    console.error('Error updating product:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a product
 * @param {string} businessId - UUID of the business
 * @param {string} productId - UUID of the product
 * @returns {Promise<object>} - { success }
 */
async function deleteProduct(businessId, productId) {
  try {
    // Check if product exists and belongs to business
    const existingProduct = await getProductById(businessId, productId);
    if (!existingProduct.success) {
      return existingProduct;
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('business_id', businessId);

    if (error) throw error;

    return {
      success: true,
      message: 'Product deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting product:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get low stock products
 * @param {string} businessId - UUID of the business
 * @returns {Promise<object>} - { success, products }
 */
async function getLowStockProducts(businessId, locationId = null) {
  try {
    let query = supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId);
    if (locationId) {
      // treat rows with NULL location_id as part of the default location
      // so that legacy data remains visible until the migration runs
      const { data: defaultLoc } = await supabase
        .from('locations')
        .select('id')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      const isDefault = defaultLoc && defaultLoc.id === locationId;
      if (isDefault) {
        query = query.or(`location_id.eq.${locationId},location_id.is.null`);
      } else {
        query = query.eq('location_id', locationId);
      }
    }
    query = query.order('quantity', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    // Filter in JS: quantity <= low_stock_alert
    // (supabase.raw() is not available in Supabase JS v2 for column-to-column comparisons)
    const products = (data || []).filter(
      p => parseInt(p.quantity, 10) <= parseInt(p.low_stock_alert, 10)
    );

    return {
      success: true,
      products
    };
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update product quantity (for stock adjustments)
 * @param {string} businessId - UUID of the business
 * @param {string} workerId - UUID of the worker
 * @param {string} productId - UUID of the product
 * @param {number} quantityChange - Amount to add (positive) or remove (negative)
 * @returns {Promise<object>} - { success, product }
 */
async function adjustProductQuantity(businessId, workerId, productId, quantityChange) {
  try {
    const existingProduct = await getProductById(businessId, productId);
    if (!existingProduct.success) {
      return existingProduct;
    }

    const newQuantity = existingProduct.product.quantity + quantityChange;

    if (newQuantity < 0) {
      return {
        success: false,
        error: 'Insufficient stock'
      };
    }

    // Try update with `updated_by`, fall back if column missing
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ quantity: newQuantity, updated_by: workerId })
        .eq('id', productId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, product: data };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (/column .* does not exist/i.test(msg) || msg.includes("Could not find the 'updated_by' column")) {
        const { data: data2, error: err2 } = await supabase
          .from('products')
          .update({ quantity: newQuantity })
          .eq('id', productId)
          .eq('business_id', businessId)
          .select()
          .single();
        if (err2) throw err2;
        return { success: true, product: data2 };
      }
      throw err;
    }
  } catch (error) {
    console.error('Error adjusting product quantity:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
  adjustProductQuantity
};
