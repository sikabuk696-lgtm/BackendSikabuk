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

// GET /api/products/:id - Get a single product
router.get('/:id', validateParam('id'), productController.getProduct);

// POST /api/products - Create a new product
router.post('/', productController.createProduct);

// PUT /api/products/:id - Update a product
router.put('/:id', validateParam('id'), productController.updateProduct);

// DELETE /api/products/:id - Delete a product
router.delete('/:id', validateParam('id'), productController.deleteProduct);

// PATCH /api/products/:id/quantity - Adjust product quantity
router.patch('/:id/quantity', validateParam('id'), productController.adjustQuantity);

module.exports = router;
