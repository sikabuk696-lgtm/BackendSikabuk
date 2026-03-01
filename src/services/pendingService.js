const { supabase } = require('../config/supabase');

/**
 * Pending Changes Service
 *
 * Workers cannot directly mutate products or customers.
 * Every write by a worker is stored here with status='pending'.
 * The business owner reviews and either approves (which applies the real DB change)
 * or rejects (which stores a reason for the worker to see).
 */

/**
 * Submit a new pending change request.
 */
async function createPendingChange({
  businessId,
  workerId,
  workerName,
  entityType,
  action,
  entityId,
  entityName,
  payload,
}) {
  const { data, error } = await supabase
    .from('pending_changes')
    .insert([{
      business_id:  businessId,
      worker_id:    workerId,
      worker_name:  workerName || null,
      entity_type:  entityType,
      action,
      entity_id:    entityId  || null,
      entity_name:  entityName || null,
      payload,
      status: 'pending',
    }])
    .select()
    .single();

  if (error) throw error;
  return { success: true, change: data };
}

/**
 * List pending changes for a business.
 * @param {string} businessId
 * @param {object} opts - { status: 'pending'|'approved'|'rejected', entityType }
 */
async function listPendingChanges(businessId, opts = {}) {
  const { status = 'pending', entityType } = opts;

  let query = supabase
    .from('pending_changes')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) throw error;
  return { success: true, changes: data, count: data.length };
}

/**
 * Count pending (status=pending) changes for a business.
 */
async function countPending(businessId) {
  const { count, error } = await supabase
    .from('pending_changes')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending');

  if (error) throw error;
  return count || 0;
}

/**
 * Approve a pending change — applies the actual DB mutation and marks row as approved.
 */
async function approveChange(businessId, ownerId, changeId) {
  // Load the pending row
  const { data: change, error: loadErr } = await supabase
    .from('pending_changes')
    .select('*')
    .eq('id', changeId)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .single();

  if (loadErr || !change) {
    throw { status: 404, message: 'Pending change not found or already reviewed' };
  }

  // Apply the actual database operation
  let result;

  if (change.entity_type === 'product') {
    const productService = require('./productService');

    if (change.action === 'create') {
      result = await productService.createProduct(businessId, change.worker_id, change.payload);
    } else if (change.action === 'update') {
      result = await productService.updateProduct(businessId, ownerId, change.entity_id, change.payload);
    } else if (change.action === 'stock') {
      result = await productService.adjustProductQuantity(
        businessId, ownerId, change.entity_id, change.payload.change
      );
    } else if (change.action === 'delete') {
      result = await productService.deleteProduct(businessId, change.entity_id);
    }
  } else if (change.entity_type === 'customer') {
    const customerService = require('./customerService');

    if (change.action === 'create') {
      result = await customerService.createCustomer(businessId, change.worker_id, change.payload);
    } else if (change.action === 'update') {
      result = await customerService.updateCustomer(
        businessId, change.worker_id, change.entity_id, change.payload
      );
    }
  }

  if (!result || !result.success) {
    throw { status: 400, message: result?.error || 'Failed to apply change — check the payload' };
  }

  // Mark as approved
  await supabase
    .from('pending_changes')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: ownerId,
    })
    .eq('id', changeId);

  return { success: true, result };
}

/**
 * Reject a pending change — stores a reason and marks it rejected.
 */
async function rejectChange(businessId, ownerId, changeId, reason) {
  const { data, error } = await supabase
    .from('pending_changes')
    .update({
      status: 'rejected',
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: ownerId,
    })
    .eq('id', changeId)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !data) {
    throw { status: 404, message: 'Pending change not found or already reviewed' };
  }
  return { success: true, change: data };
}

module.exports = {
  createPendingChange,
  listPendingChanges,
  countPending,
  approveChange,
  rejectChange,
};
