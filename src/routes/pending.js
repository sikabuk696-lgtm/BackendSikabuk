const express = require('express');
const router = express.Router();
const pendingController = require('../controllers/pendingController');
const { authenticate } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

// All pending routes require authentication
router.use(authenticate);

// GET /api/pending/mine — worker fetches their own pending product/customer submissions
// Must be registered BEFORE ownerOnly middleware so workers can call it
router.get('/mine', pendingController.myChanges);

// All routes below are owner-only
router.use(ownerOnly);

// GET /api/pending          — list changes (default: status=pending)
router.get('/', pendingController.list);

// GET /api/pending/count    — badge count for sidebar
router.get('/count', pendingController.count);

// POST /api/pending/:id/approve  — approve & apply a change
router.post('/:id/approve', validateParam('id'), pendingController.approve);

// POST /api/pending/:id/reject   — reject a change with optional reason
router.post('/:id/reject', validateParam('id'), pendingController.reject);

module.exports = router;
