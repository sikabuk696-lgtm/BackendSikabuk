const salesService = require('../services/salesService');

/**
 * Sales Controller
 * HTTP handlers for sales endpoints
 */

/**
 * GET /api/sales
 * Get all sales for the authenticated business
 */
async function getAllSales(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate, customerId, productId, paymentStatus } = req.query;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await salesService.getSales(businessId, {
      startDate,
      endDate,
      customerId,
      productId,
      paymentStatus,
      locationId
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      sales: result.sales,
      count: result.count,
      totalRevenue: result.totalRevenue
    });
  } catch (error) {
    console.error('Error in getAllSales:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/sales/summary
 * Get sales analytics summary
 */
async function getSummary(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate } = req.query;

    const result = await salesService.getSalesSummary(businessId, { startDate, endDate });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      summary: result.summary
    });
  } catch (error) {
    console.error('Error in getSummary:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/sales/:id
 * Get a single sale by ID
 */
async function getSale(req, res) {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const result = await salesService.getSaleById(businessId, id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      sale: result.sale
    });
  } catch (error) {
    console.error('Error in getSale:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/sales
 * Create a new sale (automatically manages inventory and customer debt)
 */
async function createSale(req, res) {
  try {
    const businessId = req.businessId;
    const workerId = req.workerId;
    const saleData = req.body;

    // Enforce worker single-location: non-owner workers may only record sales for their assigned location
    if (req.role !== 'owner') {
      // override any incoming location_id with the worker's assigned location
      saleData.location_id = req.locationId || saleData.location_id || null;
    }

    const result = await salesService.createSale(businessId, workerId, saleData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(201).json({
      success: true,
      sale: result.sale,
      message: 'Sale recorded successfully'
    });
  } catch (error) {
    console.error('Error in createSale:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * PATCH /api/sales/:id/payment-status
 * Update sale payment status (e.g., mark credit sale as paid)
 */
async function updatePaymentStatus(req, res) {
  try {
    const businessId = req.businessId;
    const workerId = req.workerId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Payment status is required'
      });
    }

    const result = await salesService.updateSalePaymentStatus(
      businessId,
      workerId,
      id,
      status
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      sale: result.sale,
      message: 'Payment status updated successfully'
    });
  } catch (error) {
    console.error('Error in updatePaymentStatus:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/sales/batches
 * Get all daily batches for the business
 */
async function getDailyBatches(req, res) {
  try {
    const businessId = req.businessId;
    const { startDate, endDate, approved } = req.query;
    const locationId = req.effectiveLocationId || req.query.locationId || null;

    const result = await salesService.getDailyBatches(businessId, {
      startDate,
      endDate,
      approved: approved === 'true' ? true : approved === 'false' ? false : undefined,
      locationId
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      batches: result.batches
    });
  } catch (error) {
    console.error('Error in getDailyBatches:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/sales/batches/:batchId
 * Get details of a specific daily batch
 */
async function getBatchDetails(req, res) {
  try {
    const businessId = req.businessId;
    const batchId = req.params.batchId;

    const result = await salesService.getBatchDetails(businessId, batchId);

    if (!result.success) {
      return res.status(result.error === 'Batch not found' ? 404 : 400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      batch: result.batch,
      sales: result.sales
    });
  } catch (error) {
    console.error('Error in getBatchDetails:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/sales/batches/:batchId/approve
 * Approve a daily batch (owner only)
 */
async function approveBatch(req, res) {
  try {
    const businessId = req.businessId;
    const batchId = req.params.batchId;
    const ownerId = req.workerId; // From auth middleware

    const result = await salesService.approveDailyBatch(businessId, batchId, ownerId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error in approveBatch:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = {
  getAllSales,
  getSummary,
  getSale,
  createSale,
  updatePaymentStatus,
  getDailyBatches,
  getBatchDetails,
  approveBatch
};
