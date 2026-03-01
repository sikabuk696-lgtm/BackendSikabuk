const express = require('express');
const router = express.Router();
const pendingController = require('../controllers/pendingController');
const { authenticate } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

// All pending routes require authentication + owner role
router.use(authenticate);
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
