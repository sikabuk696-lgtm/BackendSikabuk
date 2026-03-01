const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');
const { workerOrOwner } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

/**
 * Customer Routes
 * All routes require authentication and are scoped to the business
 * Both owners and workers can manage customers
 */

// Apply authentication middleware to all customer routes
router.use(authenticate);
router.use(workerOrOwner);

// GET /api/customers - Get all customers (with optional filters)
router.get('/', customerController.getAllCustomers);

// GET /api/customers/with-debt - Get customers with outstanding debt
router.get('/with-debt', customerController.getCustomersWithDebt);

// GET /api/customers/:id - Get a single customer
router.get('/:id', validateParam('id'), customerController.getCustomer);

// POST /api/customers - Create a new customer
router.post('/', customerController.createCustomer);

// PUT /api/customers/:id - Update a customer
router.put('/:id', validateParam('id'), customerController.updateCustomer);

// DELETE /api/customers/:id - Delete a customer
router.delete('/:id', validateParam('id'), customerController.deleteCustomer);

// PATCH /api/customers/:id/debt - Adjust customer debt
router.patch('/:id/debt', validateParam('id'), customerController.adjustDebt);

module.exports = router;
