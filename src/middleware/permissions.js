/**
 * Role-Based Permission Middleware
 * 
 * Roles & Permissions:
 * - owner: Full access to everything (CEO/Business Owner)
 * - worker: General access - can do everything except manage workers/business settings
 */

/**
 * Check if user has required role(s)
 * @param {string[]} allowedRoles - Array of roles that can access this endpoint
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    const { role } = req;

    if (!role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This action requires owner permission.`
      });
    }

    next();
  };
};

/**
 * Owner-only access (for sensitive operations)
 */
const ownerOnly = checkRole(['owner']);

/**
 * Worker or Owner access (for general business operations)
 */
const workerOrOwner = checkRole(['owner', 'worker']);

/**
 * Permissions for managing products
 * Both owner and workers can manage products
 */
const canManageProducts = workerOrOwner;

/**
 * Permissions for viewing products
 * Both owner and workers can view products
 */
const canViewProducts = workerOrOwner;

/**
 * Permissions for recording sales
 * Both owner and workers can record sales
 */
const canRecordSales = workerOrOwner;

/**
 * Permissions for viewing sales
 * Both owner and workers can view sales
 */
const canViewSales = workerOrOwner;

/**
 * Permissions for managing customers
 * Both owner and workers can manage customers
 */
const canManageCustomers = workerOrOwner;

/**
 * Permissions for viewing customers
 * Both owner and workers can view customers
 */
const canViewCustomers = workerOrOwner;

/**
 * Permissions for recording expenses
 * Both owner and workers can record expenses
 */
const canRecordExpenses = workerOrOwner;

/**
 * Permissions for viewing expenses
 * Both owner and workers can view expenses
 */
const canViewExpenses = workerOrOwner;

/**
 * Permissions for viewing analytics
 * Both owner and workers can view analytics
 */
const canViewAnalytics = workerOrOwner;

/**
 * Permissions for managing workers
 * Only owner can manage workers (add/remove employees)
 */
const canManageWorkers = ownerOnly;

/**
 * Permissions for managing business settings
 * Only owner can manage business settings (subscription, etc.)
 */
const canManageBusinessSettings = ownerOnly;

module.exports = {
  checkRole,
  ownerOnly,
  workerOrOwner,
  canManageProducts,
  canViewProducts,
  canRecordSales,
  canViewSales,
  canManageCustomers,
  canViewCustomers,
  canRecordExpenses,
  canViewExpenses,
  canViewAnalytics,
  canManageWorkers,
  canManageBusinessSettings
};
