const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authenticate } = require('../middleware/auth');
const { workerOrOwner, ownerOnly } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

/**
 * Sales Routes
 * All routes require authentication and are scoped to the business
 * Both owners and workers can manage sales
 */

// Apply authentication middleware to all sales routes
router.use(authenticate);
router.use(workerOrOwner);

// GET /api/sales/summary - Get sales analytics summary
router.get('/summary', salesController.getSummary);

// Daily Batch Management Routes
// GET /api/sales/batches - Get all daily batches
router.get('/batches', salesController.getDailyBatches);

// GET /api/sales/batches/:batchId - Get batch details with sales
router.get('/batches/:batchId', validateParam('batchId'), salesController.getBatchDetails);

// POST /api/sales/batches/:batchId/approve - Approve a batch (owner only)
router.post('/batches/:batchId/approve', validateParam('batchId'), ownerOnly, salesController.approveBatch);

// GET /api/sales - Get all sales (with optional filters)
router.get('/', salesController.getAllSales);

// GET /api/sales/:id - Get a single sale
router.get('/:id', validateParam('id'), salesController.getSale);

// POST /api/sales - Create a new sale (automatically updates inventory and debt)
router.post('/', salesController.createSale);

// PATCH /api/sales/:id/payment-status - Update payment status
router.patch('/:id/payment-status', validateParam('id'), salesController.updatePaymentStatus);

module.exports = router;
