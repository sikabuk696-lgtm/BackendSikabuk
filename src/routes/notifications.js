const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { getNotifications, markRead, markAllRead } = require('../controllers/notificationsController');

// All routes require authentication
router.use(authenticate);

// GET  /api/notifications
router.get('/', getNotifications);

// PATCH /api/notifications/mark-all-read  (must come before /:id to avoid conflict)
router.patch('/mark-all-read', markAllRead);

// PATCH /api/notifications/:id/read
router.patch('/:id/read', markRead);

module.exports = router;
