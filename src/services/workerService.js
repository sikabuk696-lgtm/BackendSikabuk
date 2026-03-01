const bcrypt = require('bcrypt');
const { supabase } = require('../config/database');

const SALT_ROUNDS = 10;
const PIN_REGEX = /^\d{4}$/;

/**
 * Worker Management Service
 * Allows business owner to manage employees (cashiers, stock managers, etc.)
 */
class WorkerService {
  /**
   * Add a new worker to the business
   * @param {string} business_id - Business UUID
   * @param {string} worker_name - Worker's name
   * @param {string} pin - 4-digit PIN for worker login
   */
  async addWorker({ business_id, worker_name, pin, location_id = null }) {
    // Validate inputs
    if (!business_id || !worker_name || !pin) {
      throw { status: 400, message: 'Business ID, worker name, and PIN are required' };
    }

    if (worker_name.length < 2) {
      throw { status: 400, message: 'Worker name must be at least 2 characters' };
    }

    if (!PIN_REGEX.test(pin)) {
      throw { status: 400, message: 'PIN must be exactly 4 digits' };
    }

    // Hash the PIN
    const pin_hash = await bcrypt.hash(pin, SALT_ROUNDS);

    // Create worker with 'worker' role and optional single assigned location
    const { data: newWorker, error } = await supabase
      .from('workers')
      .insert([{
        business_id,
        worker_name,
        role: 'worker',
        pin_hash,
        is_active: true,
        location_id
      }])
      .select('id, business_id, worker_name, role, is_active, location_id, created_at')
      .single();

    if (error) {
      console.error('Worker creation error:', error);
      throw { status: 500, message: 'Failed to add worker. Please try again.' };
    }

    return {
      worker: {
        id: newWorker.id,
        worker_name: newWorker.worker_name,
        role: newWorker.role,
        is_active: newWorker.is_active,
        created_at: newWorker.created_at
      }
    };
  }

  /**
   * Get all workers for a business
   * @param {string} business_id - Business UUID
   */
  async getWorkers({ business_id, location_id = null }) {
    if (!business_id) {
      throw { status: 400, message: 'Business ID is required' };
    }

    let query = supabase
      .from('workers')
      .select('id, worker_name, role, is_active, location_id, created_at, last_login_at')
      .eq('business_id', business_id)
      .order('created_at', { ascending: true });

    if (location_id) {
      query = query.eq('location_id', location_id);
    }

    const { data: workers, error } = await query;

    if (error) {
      console.error('Get workers error:', error);
      throw { status: 500, message: 'Failed to fetch workers' };
    }

    return {
      workers: workers.map(w => ({
        id: w.id,
        worker_name: w.worker_name,
        role: w.role,
        is_active: w.is_active,
        location_id: w.location_id || null,
        created_at: w.created_at,
        last_login_at: w.last_login_at
      }))
    };
  }

  /**
   * Update worker details
   * @param {string} worker_id - Worker UUID
   * @param {string} business_id - Business UUID (for verification)
   * @param {object} updates - { worker_name?, pin? }
   */
  async updateWorker({ worker_id, business_id, updates }) {
    if (!worker_id || !business_id) {
      throw { status: 400, message: 'Worker ID and Business ID are required' };
    }

    // Verify worker belongs to this business
    const { data: worker, error: fetchError } = await supabase
      .from('workers')
      .select('id, business_id, role')
      .eq('id', worker_id)
      .eq('business_id', business_id)
      .single();

    if (fetchError || !worker) {
      throw { status: 404, message: 'Worker not found or does not belong to this business' };
    }

    if (worker.role === 'owner') {
      throw { status: 403, message: 'Cannot update owner account through this endpoint' };
    }

    // Prepare update object
    const updateData = {};

    if (updates.worker_name) {
      if (updates.worker_name.length < 2) {
        throw { status: 400, message: 'Worker name must be at least 2 characters' };
      }
      updateData.worker_name = updates.worker_name;
    }

    if (updates.pin) {
      if (!PIN_REGEX.test(updates.pin)) {
        throw { status: 400, message: 'PIN must be exactly 4 digits' };
      }
      updateData.pin_hash = await bcrypt.hash(updates.pin, SALT_ROUNDS);
    }

    // Allow assigning a single location to a worker (owner-only operation should validate in controller)
    if (updates.location_id !== undefined) {
      updateData.location_id = updates.location_id || null;
    }

    if (Object.keys(updateData).length === 0) {
      throw { status: 400, message: 'No valid updates provided' };
    }

    updateData.updated_at = new Date().toISOString();

    // Update worker
    const { data: updatedWorker, error: updateError } = await supabase
      .from('workers')
      .update(updateData)
      .eq('id', worker_id)
      .eq('business_id', business_id)
      .select('id, worker_name, role, is_active')
      .single();

    if (updateError) {
      console.error('Worker update error:', updateError);
      throw { status: 500, message: 'Failed to update worker' };
    }

    return {
      worker: updatedWorker
    };
  }

  /**
   * Deactivate a worker (soft delete)
   * @param {string} worker_id - Worker UUID
   * @param {string} business_id - Business UUID (for verification)
   */
  async deactivateWorker({ worker_id, business_id }) {
    if (!worker_id || !business_id) {
      throw { status: 400, message: 'Worker ID and Business ID are required' };
    }

    // Verify worker belongs to this business and is not owner
    const { data: worker, error: fetchError } = await supabase
      .from('workers')
      .select('id, business_id, role, is_active')
      .eq('id', worker_id)
      .eq('business_id', business_id)
      .single();

    if (fetchError || !worker) {
      throw { status: 404, message: 'Worker not found' };
    }

    if (worker.role === 'owner') {
      throw { status: 403, message: 'Cannot deactivate owner account' };
    }

    // Deactivate worker
    const { error: updateError } = await supabase
      .from('workers')
      .update({ 
        is_active: false
      })
      .eq('id', worker_id)
      .eq('business_id', business_id);

    if (updateError) {
      console.error('Worker deactivation error:', updateError);
      throw { status: 500, message: 'Failed to deactivate worker' };
    }

    return {
      message: 'Worker deactivated successfully'
    };
  }

  /**
   * Reactivate a deactivated worker
   * @param {string} worker_id - Worker UUID
   * @param {string} business_id - Business UUID (for verification)
   */
  async reactivateWorker({ worker_id, business_id }) {
    if (!worker_id || !business_id) {
      throw { status: 400, message: 'Worker ID and Business ID are required' };
    }

    // Update worker
    const { error: updateError } = await supabase
      .from('workers')
      .update({ 
        is_active: true
      })
      .eq('id', worker_id)
      .eq('business_id', business_id);

    if (updateError) {
      console.error('Worker reactivation error:', updateError);
      throw { status: 500, message: 'Failed to reactivate worker' };
    }

    return {
      message: 'Worker reactivated successfully'
    };
  }

  /**
   * Get worker activity summary
   * @param {string} worker_id - Worker UUID
   * @param {string} business_id - Business UUID
   */
  async getWorkerActivity({ worker_id, business_id }) {
    if (!worker_id || !business_id) {
      throw { status: 400, message: 'Worker ID and Business ID are required' };
    }

    // Get counts of actions performed by this worker
    const { data: salesCount } = await supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('user_id', worker_id);

    const { data: productsCount } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('user_id', worker_id);

    const { data: expensesCount } = await supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('user_id', worker_id);

    return {
      activity: {
        sales_recorded: salesCount || 0,
        products_created: productsCount || 0,
        expenses_recorded: expensesCount || 0
      }
    };
  }
}

module.exports = new WorkerService();
