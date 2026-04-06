/**
 * Role-Based Permission Middleware
 *
 * Roles & Permissions:
 * - owner       : Full access to everything (Business Owner, Google OAuth)
 * - cofounder   : Full owner-level access (Google OAuth, stored as worker with role='cofounder')
 * - manager     : Can manage expenses + general ops, goes through pending queue for products/customers
 * - accountant  : Can manage expenses, read-only general ops
 * - cashier     : Sales & customers only (via pending queue)
 * - stock_manager: Products & stock only (via pending queue)
 * - worker      : Legacy general worker (via pending queue)
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
 * Owner-only access (for sensitive operations — workers/shops/approvals).
 * Co-founders have the same level of access as the owner.
 */
const ownerOnly = checkRole(['owner', 'cofounder']);

/**
 * Worker or Owner access (for general business operations).
 * All named roles are included so every employee can reach general routes.
 */
const workerOrOwner = checkRole(['owner', 'cofounder', 'manager', 'accountant', 'cashier', 'stock_manager', 'worker']);

/**
 * Expense management — owner, co-founder, manager, and accountant only.
 */
const canManageExpenses = checkRole(['owner', 'cofounder', 'manager', 'accountant']);

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
 * Owner, co-founder, manager and accountant only
 */
const canRecordExpenses = canManageExpenses;

/**
 * Permissions for viewing expenses
 * Owner, co-founder, manager and accountant only
 */
const canViewExpenses = canManageExpenses;

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
  canManageExpenses,
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
