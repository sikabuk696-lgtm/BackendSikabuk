const authService = require('../services/authService');

/**
 * Authentication Middleware
 * Verifies JWT token and extracts business/worker context
 * 
 * Attaches to req:
 * - req.businessId: Business UUID   * - req.workerId: Worker UUID
 * - req.role: Worker role (owner, cashier, stock_manager, viewer)
 * - req.workerName: Worker name
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const decoded = authService.verifyToken(token);
    
    // Extract business and worker context from JWT
    req.businessId = decoded.businessId;
    req.workerId = decoded.workerId;
    req.role = decoded.role;
    req.workerName = decoded.workerName;

    // If this is a worker token, load worker's assigned location and attach to request
    // so endpoint logic can enforce single-location behavior.
    if (req.workerId) {
      try {
        const { supabase } = require('../config/database');
        const { data: workerRow } = await supabase
          .from('workers')
          .select('location_id')
          .eq('id', req.workerId)
          .eq('business_id', req.businessId)
          .single();
        req.locationId = workerRow?.location_id || null;
        // effectiveLocationId: forces data queries to a single shop for workers with an assignment.
        // Owners and unassigned workers keep this null so the query-param or UI selection applies.
        req.effectiveLocationId = req.locationId || null;
      } catch (err) {
        // don't block authentication on this; just leave locationId null
        req.locationId = null;
        req.effectiveLocationId = null;
      }
    } else {
      req.locationId = null;
      req.effectiveLocationId = null;
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token'
    });
  }
};

module.exports = { authenticate };
