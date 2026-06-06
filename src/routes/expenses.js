const express = require('express');
const multer = require('multer');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middleware/auth');
const { canManageExpenses } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

const ALLOWED_ATTACHMENT_MIMES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'application/pdf'
];

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 10 * 1024 * 1024,
	},
	fileFilter: (req, file, cb) => {
		if (ALLOWED_ATTACHMENT_MIMES.includes(file.mimetype)) {
			cb(null, true);
			return;
		}
		cb(new Error('Only JPG, PNG, WEBP, and PDF files are allowed'));
	}
});

/**
 * Expense Routes
 * All routes require authentication and are scoped to the business
 * ⚠️ OWNER ONLY - Workers cannot manage expenses
 * Only the business owner/CEO can view, create, update, or delete expenses
 */

// Apply authentication middleware to all expense routes
router.use(authenticate);
router.use(canManageExpenses);

// GET /api/expenses - Get all expenses (with optional filters)
router.get('/', expenseController.getAllExpenses);

// GET /api/expenses/by-category - Get expenses grouped by category
router.get('/by-category', expenseController.getByCategory);

// GET /api/expenses/:id - Get a single expense
router.get('/:id', validateParam('id'), expenseController.getExpense);

// GET /api/expenses/:id/attachment/download - Download a proof attachment
router.get('/:id/attachment/download', validateParam('id'), expenseController.downloadExpenseAttachment);

// POST /api/expenses - Create a new expense
router.post('/', upload.single('attachment'), expenseController.createExpense);

// PUT /api/expenses/:id - Update an expense
router.put('/:id', validateParam('id'), upload.single('attachment'), expenseController.updateExpense);

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', validateParam('id'), expenseController.deleteExpense);

module.exports = router;
