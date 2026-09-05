const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate } = require('../middleware/auth');
const { workerOrOwner } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

/**
 * Product Routes
 * All routes require authentication and are scoped to the business
 * Both owners and workers can manage products
 */

// Apply authentication middleware to all product routes
router.use(authenticate);
router.use(workerOrOwner);

// GET /api/products - Get all products (with optional filters)
router.get('/', productController.getAllProducts);

// GET /api/products/low-stock - Get low stock products
router.get('/low-stock', productController.getLowStock);

// GET /api/products/cost-history/summary - Business-wide procurement spend summary
router.get('/cost-history/summary', productController.getCostSummary);

// GET /api/products/:id - Get a single product
router.get('/:id', validateParam('id'), productController.getProduct);

// GET /api/products/:id/cost-history - Cost price history for one product
router.get('/:id/cost-history', validateParam('id'), productController.getCostHistory);

// POST /api/products - Create a new product
router.post('/', productController.createProduct);

// PUT /api/products/:id - Update a product
router.put('/:id', validateParam('id'), productController.updateProduct);

// DELETE /api/products/:id - Delete a product
router.delete('/:id', validateParam('id'), productController.deleteProduct);

// PATCH /api/products/:id/quantity - Adjust product quantity
router.patch('/:id/quantity', validateParam('id'), productController.adjustQuantity);

// POST /api/products/:id/restock - Record a new shipment (quantity + new unit cost)
router.post('/:id/restock', validateParam('id'), productController.restock);

module.exports = router;
