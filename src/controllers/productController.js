const productService = require('../services/productService');
const pendingService = require('../services/pendingService');
const { createNotification } = require('../services/notificationService');

/**
 * Product Controller
 * HTTP handlers for product endpoints.
 * Workers submit pending-approval requests; owners apply changes directly.
 */

/**
 * GET /api/products
 * Get all products for the authenticated business
 */
async function getAllProducts(req, res) {
  try {
    const businessId = req.businessId;
    const { search, lowStock } = req.query;
    // Workers with an assigned shop are locked to it; owners use the query param
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await productService.getProducts(businessId, { search, lowStock, locationId });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      products: result.products,
      count: result.count
    });
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/products/low-stock
 * Get products that are low in stock
 */
async function getLowStock(req, res) {
  try {
    const businessId = req.businessId;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await productService.getLowStockProducts(businessId, locationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      products: result.products
    });
  } catch (error) {
    console.error('Error in getLowStock:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/products/:id
 * Get a single product by ID
 */
async function getProduct(req, res) {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const result = await productService.getProductById(businessId, id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      product: result.product
    });
  } catch (error) {
    console.error('Error in getProduct:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/products
 * Create a new product.
 * Workers → pending approval queue. Owners → direct insert.
 */
async function createProduct(req, res) {
  try {
    const businessId = req.businessId;
    const workerId   = req.workerId;
    const role       = req.role;
    const productData = req.body;

    if (!['owner', 'cofounder'].includes(role)) {
      const result = await pendingService.createPendingChange({
        businessId,
        workerId,
        workerName:  req.workerName,
        entityType:  'product',
        action:      'create',
        entityId:    null,
        entityName:  productData.name || 'New Product',
        payload:     productData,
      });
      createNotification(
        businessId, workerId, req.workerName, role,
        'product_pending',
        'Product Awaiting Approval',
        `${req.workerName} submitted '${productData.name || 'a product'}' for approval`,
        'product', null
      );
      return res.status(202).json({
        success: true,
        pending: true,
        change:  result.change,
        message: 'Product submitted for owner approval',
      });
    }

    const result = await productService.createProduct(businessId, workerId, productData);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    createNotification(
      req.businessId, req.workerId, req.workerName, req.role,
      'product_added',
      'Product Added',
      `${req.workerName} added '${result.product.name}' to inventory`,
      'product', result.product.id
    );
    return res.status(201).json({ success: true, product: result.product, message: 'Product created successfully' });
  } catch (error) {
    console.error('Error in createProduct:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * PUT /api/products/:id
 * Update a product.
 * Workers → pending approval queue. Owners → direct update.
 */
async function updateProduct(req, res) {
  try {
    const businessId = req.businessId;
    const workerId   = req.workerId;
    const role       = req.role;
    const { id }     = req.params;
    const updates    = req.body;

    if (!['owner', 'cofounder'].includes(role)) {
      // Snapshot current product so we can show before/after in the approval UI
      const current = await productService.getProductById(businessId, id);
      const result = await pendingService.createPendingChange({
        businessId,
        workerId,
        workerName:  req.workerName,
        entityType:  'product',
        action:      'update',
        entityId:    id,
        entityName:  current.product?.name || id,
        payload: {
          ...updates,
          previous_quantity: current.product?.quantity ?? 0,
        },
      });
      createNotification(
        businessId, workerId, req.workerName, role,
        'product_pending',
        'Product Update Awaiting Approval',
        `${req.workerName} requested an update for '${current.product?.name || 'a product'}' — pending approval`,
        'product', id
      );
      return res.status(202).json({
        success: true,
        pending: true,
        change:  result.change,
        message: 'Product update submitted for owner approval',
      });
    }

    const result = await productService.updateProduct(businessId, workerId, id, updates);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    createNotification(
      req.businessId, req.workerId, req.workerName, req.role,
      'product_updated',
      'Product Updated',
      `${req.workerName} updated '${result.product.name}'`,
      'product', result.product.id
    );
    return res.status(200).json({ success: true, product: result.product, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error in updateProduct:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * DELETE /api/products/:id
 * Delete a product.
 * Workers → pending approval. Owners → direct delete.
 */
async function deleteProduct(req, res) {
  try {
    const businessId = req.businessId;
    const workerId   = req.workerId;
    const role       = req.role;
    const { id }     = req.params;

    if (!['owner', 'cofounder'].includes(role)) {
      const current = await productService.getProductById(businessId, id);
      const result = await pendingService.createPendingChange({
        businessId,
        workerId,
        workerName:  req.workerName,
        entityType:  'product',
        action:      'delete',
        entityId:    id,
        entityName:  current.product?.name || id,
        payload:     { id },
      });
      createNotification(
        businessId, workerId, req.workerName, role,
        'product_pending',
        'Product Delete Awaiting Approval',
        `${req.workerName} requested deletion of '${current.product?.name || 'a product'}' — pending approval`,
        'product', id
      );
      return res.status(202).json({
        success: true,
        pending: true,
        change:  result.change,
        message: 'Delete request submitted for owner approval',
      });
    }

    const result = await productService.deleteProduct(businessId, id);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    createNotification(
      req.businessId, req.workerId, req.workerName, req.role,
      'product_deleted',
      'Product Deleted',
      `${req.workerName} deleted a product from inventory`,
      'product', id
    );
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error in deleteProduct:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * PATCH /api/products/:id/quantity
 * Adjust product quantity (stock adjustment).
 * Workers → pending approval. Owners → direct adjustment.
 */
async function adjustQuantity(req, res) {
  try {
    const businessId = req.businessId;
    const workerId   = req.workerId;
    const role       = req.role;
    const { id }     = req.params;
    const { change } = req.body;

    if (change === undefined || isNaN(change)) {
      return res.status(400).json({ success: false, error: 'Invalid quantity change value' });
    }

    if (!['owner', 'cofounder'].includes(role)) {
      const current = await productService.getProductById(businessId, id);
      const previousQty = current.product?.quantity ?? 0;
      const changeInt   = parseInt(change, 10);
      const totalQty    = Math.max(0, previousQty + changeInt);
      const result = await pendingService.createPendingChange({
        businessId,
        workerId,
        workerName:  req.workerName,
        entityType:  'product',
        action:      'stock',
        entityId:    id,
        entityName:  current.product?.name || id,
        payload:     { change: changeInt, previous_quantity: previousQty, total_quantity: totalQty },
      });
      return res.status(202).json({
        success: true,
        pending: true,
        change:  result.change,
        message: 'Stock adjustment submitted for owner approval',
      });
    }

    const result = await productService.adjustProductQuantity(businessId, workerId, id, parseInt(change, 10));
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    return res.status(200).json({ success: true, product: result.product, message: 'Quantity adjusted successfully' });
  } catch (error) {
    console.error('Error in adjustQuantity:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = {
  getAllProducts,
  getLowStock,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustQuantity
};
