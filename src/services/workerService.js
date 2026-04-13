const bcrypt = require('bcrypt');
const { supabase } = require('../config/database');

const SALT_ROUNDS = 10;
const PIN_REGEX = /^\d{4}$/;

const VALID_ROLES = ['worker', 'cashier', 'stock_manager', 'manager', 'accountant', 'cofounder'];

/**
 * Worker Management Service
 * Allows business owner to manage employees (cashiers, stock managers, etc.)
 */
class WorkerService {
  /**
   * Add a new worker to the business
   * @param {string} business_id  - Business UUID
   * @param {string} worker_name  - Worker's name
   * @param {string} [pin]        - 4-digit PIN (not required for co-founders)
   * @param {string} [role]       - One of VALID_ROLES (defaults to 'worker')
   * @param {string} [email]      - Email address (required for co-founders)
   * @param {string} [location_id]- Optional assigned shop UUID
   */
  async addWorker({ business_id, worker_name, pin, role = 'worker', email = null, location_id = null }) {
    // Validate role
    if (!VALID_ROLES.includes(role)) {
      throw { status: 400, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
    }

    // Validate inputs
    if (!business_id || !worker_name) {
      throw { status: 400, message: 'Business ID and worker name are required' };
    }

    if (worker_name.length < 2) {
      throw { status: 400, message: 'Worker name must be at least 2 characters' };
    }

    // Co-founders log in via Google OAuth — PIN is set post-login, email required
    if (role === 'cofounder') {
      if (!email || !email.includes('@')) {
        throw { status: 400, message: 'Email is required for co-founders (they log in with Google)' };
      }
    } else {
      // All other roles require a PIN
      if (!pin) throw { status: 400, message: 'PIN is required' };
      if (!PIN_REGEX.test(pin)) throw { status: 400, message: 'PIN must be exactly 4 digits' };
    }

    // Hash the PIN (null for co-founders — they'll set it after first OAuth login)
    let pin_hash = null;
    if (pin) pin_hash = await bcrypt.hash(pin, SALT_ROUNDS);

    // Create worker
    const insertData = {
      business_id,
      worker_name,
      role,
      pin_hash,
      is_active: true,
      location_id,
    };
    if (email) insertData.email = email.toLowerCase().trim();

    const { data: newWorker, error } = await supabase
      .from('workers')
      .insert([insertData])
      .select('id, business_id, worker_name, role, email, is_active, location_id, created_at')
      .single();

    if (error) {
      console.error('Worker creation error:', error);
      if (error.code === '23505') {
        throw { status: 409, message: 'A co-founder with that email already exists in this business.' };
      }
      throw { status: 500, message: 'Failed to add worker. Please try again.' };
    }

    return {
      worker: {
        id:         newWorker.id,
        worker_name:newWorker.worker_name,
        role:       newWorker.role,
        email:      newWorker.email || null,
        is_active:  newWorker.is_active,
        created_at: newWorker.created_at,
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
