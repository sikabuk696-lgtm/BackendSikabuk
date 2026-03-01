const customerService = require('../services/customerService');
const pendingService  = require('../services/pendingService');

/**
 * Customer Controller
 * HTTP handlers for customer endpoints.
 * Workers submit pending-approval requests; owners apply changes directly.
 */

/**
 * GET /api/customers
 * Get all customers for the authenticated business
 */
async function getAllCustomers(req, res) {
  try {
    const businessId = req.businessId;
    const { search, hasDebt } = req.query;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await customerService.getCustomers(businessId, { search, hasDebt, locationId });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      customers: result.customers,
      count: result.count
    });
  } catch (error) {
    console.error('Error in getAllCustomers:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/customers/with-debt
 * Get customers who have outstanding debt
 */
async function getCustomersWithDebt(req, res) {
  try {
    const businessId = req.businessId;
    const { locationId } = req.query;

    const result = await customerService.getCustomersWithDebt(businessId, locationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      customers: result.customers,
      totalDebt: result.totalDebt
    });
  } catch (error) {
    console.error('Error in getCustomersWithDebt:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/customers/:id
 * Get a single customer by ID
 */
async function getCustomer(req, res) {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const result = await customerService.getCustomerById(businessId, id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      customer: result.customer
    });
  } catch (error) {
    console.error('Error in getCustomer:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/customers
 * Create a new customer.
 * Workers who add a customer with debt go through the approval queue.
 * Workers adding a zero-debt customer are allowed directly.
 */
async function createCustomer(req, res) {
  try {
    const businessId   = req.businessId;
    const workerId     = req.workerId;
    const role         = req.role;
    const customerData = req.body;

    if (role === 'worker') {
      // Any customer addition by a worker needs owner approval
      const result = await pendingService.createPendingChange({
        businessId,
        workerId,
        workerName:  req.workerName,
        entityType:  'customer',
        action:      'create',
        entityId:    null,
        entityName:  customerData.name || 'New Customer',
        payload:     customerData,
      });
      return res.status(202).json({
        success: true,
        pending: true,
        change:  result.change,
        message: 'Customer submitted for owner approval',
      });
    }

    const result = await customerService.createCustomer(businessId, workerId, customerData);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    return res.status(201).json({ success: true, customer: result.customer, message: 'Customer created successfully' });
  } catch (error) {
    console.error('Error in createCustomer:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * PUT /api/customers/:id
 * Update a customer.
 * Workers → pending approval. Owners → direct update.
 */
async function updateCustomer(req, res) {
  try {
    const businessId = req.businessId;
    const workerId   = req.workerId;
    const role       = req.role;
    const { id }     = req.params;
    const updates    = req.body;

    if (role === 'worker') {
      // Get current customer name for the approval UI
      const current = await customerService.getCustomerById(businessId, id);
      const result = await pendingService.createPendingChange({
        businessId,
        workerId,
        workerName:  req.workerName,
        entityType:  'customer',
        action:      'update',
        entityId:    id,
        entityName:  current.customer?.name || id,
        payload:     updates,
      });
      return res.status(202).json({
        success: true,
        pending: true,
        change:  result.change,
        message: 'Customer update submitted for owner approval',
      });
    }

    const result = await customerService.updateCustomer(businessId, workerId, id, updates);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    return res.status(200).json({ success: true, customer: result.customer, message: 'Customer updated successfully' });
  } catch (error) {
    console.error('Error in updateCustomer:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * DELETE /api/customers/:id
 * Delete a customer
 */
async function deleteCustomer(req, res) {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const result = await customerService.deleteCustomer(businessId, id);

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
    console.error('Error in deleteCustomer:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * PATCH /api/customers/:id/debt
 * Adjust customer debt
 */
async function adjustDebt(req, res) {
  try {
    const businessId = req.businessId;
    const workerId = req.workerId;
    const { id } = req.params;
    const { change } = req.body;

    if (change === undefined || isNaN(change)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid debt change value'
      });
    }

    const result = await customerService.adjustCustomerDebt(
      businessId,
      workerId,
      id,
      parseFloat(change)
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      customer: result.customer,
      message: 'Debt adjusted successfully'
    });
  } catch (error) {
    console.error('Error in adjustDebt:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = {
  getAllCustomers,
  getCustomersWithDebt,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  adjustDebt
};
