const express = require('express');
const router = express.Router();
const workerController = require('../controllers/workerController');
const { authenticate } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');
const { validateAddWorker, validateUpdateWorker } = require('../middleware/validate');

/**
 * Worker Management Routes
 * All routes require authentication and owner role
 */

// Add a new worker (owner only)
router.post('/', authenticate, ownerOnly, validateAddWorker, workerController.addWorker);

// Get all workers for the business (owner only)
router.get('/', authenticate, ownerOnly, workerController.getWorkers);

// Update worker details (owner only)
router.put('/:id', authenticate, ownerOnly, validateParam('id'), validateUpdateWorker, workerController.updateWorker);

// Deactivate a worker (owner only)
router.delete('/:id', authenticate, ownerOnly, validateParam('id'), workerController.deactivateWorker);

// Reactivate a worker (owner only)
router.post('/:id/reactivate', authenticate, ownerOnly, validateParam('id'), workerController.reactivateWorker);

// Get worker activity summary (owner only)
router.get('/:id/activity', authenticate, ownerOnly, validateParam('id'), workerController.getWorkerActivity);

module.exports = router;
