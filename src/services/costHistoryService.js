const { supabase } = require('../config/supabase');

/**
 * Cost History Service
 * Records and reports every product cost price change so the business
 * can see what was spent procuring goods over time.
 *
 * All logging is fail-soft: if the `product_cost_history` table has not
 * been migrated yet, logging errors are swallowed so core product flows
 * (create / update / restock) never break.
 */

const TABLE = 'product_cost_history';

function isMissingTable(error) {
  const msg = (error && error.message) ? error.message : String(error || '');
  return /relation .* does not exist/i.test(msg)
    || /Could not find the table/i.test(msg)
    || (error && error.code === '42P01');
}

/**
 * Log a cost price change (fail-soft).
 * @param {object} entry
 *   businessId, productId, locationId?, changeType ('create'|'restock'|'update'),
 *   previousCostPrice?, newCostPrice, quantityAdded?, quantityAfter?,
 *   supplier?, note?, changedBy?, changedByName?
 */
async function logCostChange(entry) {
  try {
    const qtyAdded = Math.max(0, parseInt(entry.quantityAdded, 10) || 0);
    const newCost = parseFloat(entry.newCostPrice);
    if (!Number.isFinite(newCost)) return { success: false, error: 'Invalid cost price' };

    const row = {
      business_id:         entry.businessId,
      product_id:          entry.productId,
      location_id:         entry.locationId || null,
      change_type:         entry.changeType,
      previous_cost_price: entry.previousCostPrice !== undefined && entry.previousCostPrice !== null
        ? parseFloat(entry.previousCostPrice) : null,
      new_cost_price:      newCost,
      quantity_added:      qtyAdded,
      quantity_after:      entry.quantityAfter !== undefined ? entry.quantityAfter : null,
      total_spent:         Math.round(newCost * qtyAdded * 100) / 100,
      supplier:            entry.supplier ? String(entry.supplier).trim() : null,
      note:                entry.note ? String(entry.note).trim() : null,
      changed_by:          entry.changedBy || null,
      changed_by_name:     entry.changedByName || null,
    };

    const { error } = await supabase.from(TABLE).insert([row]);
    if (error) {
      if (!isMissingTable(error)) {
        console.error('Cost history log failed:', error.message);
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Cost history log failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get cost price history for a single product.
 */
async function getProductHistory(businessId, productId) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('business_id', businessId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTable(error)) return { success: true, history: [], migrated: false };
      throw error;
    }

    const totalSpent = (data || []).reduce((s, r) => s + parseFloat(r.total_spent || 0), 0);
    const totalUnits = (data || []).reduce((s, r) => s + (parseInt(r.quantity_added, 10) || 0), 0);

    return {
      success: true,
      history: data || [],
      migrated: true,
      stats: {
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalUnitsProcured: totalUnits,
        currentCost: data && data.length ? parseFloat(data[0].new_cost_price) : null,
        changes: (data || []).length,
      },
    };
  } catch (error) {
    console.error('Error fetching product cost history:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a business-wide procurement summary (all cost history),
 * optionally filtered by location / date range / product.
 */
async function getProcurementSummary(businessId, filters = {}) {
  try {
    let query = supabase
      .from(TABLE)
      .select('*, products:product_id (id, name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (filters.locationId) query = query.eq('location_id', filters.locationId);
    if (filters.productId) query = query.eq('product_id', filters.productId);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate)   query = query.lte('created_at', filters.endDate);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return { success: true, migrated: false, records: [], byProduct: [], stats: { totalSpent: 0, totalUnits: 0, restocks: 0 } };
      }
      throw error;
    }

    const records = data || [];
    const totalSpent = records.reduce((s, r) => s + parseFloat(r.total_spent || 0), 0);
    const totalUnits = records.reduce((s, r) => s + (parseInt(r.quantity_added, 10) || 0), 0);
    const restocks   = records.filter(r => r.change_type === 'restock').length;

    // Aggregate spend per product
    const byProductMap = new Map();
    for (const r of records) {
      const key = r.product_id;
      if (!byProductMap.has(key)) {
        byProductMap.set(key, {
          product_id: key,
          product_name: r.products?.name || 'Unknown product',
          totalSpent: 0,
          totalUnits: 0,
          lastCostPrice: parseFloat(r.new_cost_price),
          lastChangeAt: r.created_at,
          changes: 0,
        });
      }
      const agg = byProductMap.get(key);
      agg.totalSpent += parseFloat(r.total_spent || 0);
      agg.totalUnits += parseInt(r.quantity_added, 10) || 0;
      agg.changes += 1;
    }

    const byProduct = Array.from(byProductMap.values())
      .map(p => ({ ...p, totalSpent: Math.round(p.totalSpent * 100) / 100 }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return {
      success: true,
      migrated: true,
      records,
      byProduct,
      stats: {
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalUnits,
        restocks,
      },
    };
  } catch (error) {
    console.error('Error fetching procurement summary:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  logCostChange,
  getProductHistory,
  getProcurementSummary,
};
