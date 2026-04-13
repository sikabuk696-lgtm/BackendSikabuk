'use strict';

/**
 * Route-level input validation chains.
 *
 * Uses the already-installed `express-validator` package.
 * Each export is an array of validation rules + a shared error-handler that
 * rejects the request with HTTP 400 if any rule fails.
 *
 * Apply to individual routes BEFORE the controller handler, e.g.:
 *   router.post('/register', validateRegister, authController.registerBusiness);
 */

const { body, validationResult } = require('express-validator');

// Roles that workers can be assigned — must stay in sync with workerService.js
const VALID_WORKER_ROLES = [
  'worker',
  'cashier',
  'stock_manager',
  'manager',
  'accountant',
  'cofounder',
];

// Phone regex: optional leading +, then digits/spaces/hyphens/parens, 7-20 chars
const PHONE_RE = /^\+?[\d\s\-(). ]{7,20}$/;

/**
 * Shared error handler — short-circuits with the first validation error.
 */
function rejectIfInvalid(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array({ onlyFirstError: true })[0].msg,
    });
  }
  next();
}

// ── Validation chains ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * New business registration.
 */
const validateRegister = [
  body('businessName')
    .isString().withMessage('businessName must be a string')
    .trim().notEmpty().withMessage('businessName is required')
    .isLength({ max: 100 }).withMessage('businessName must be 100 characters or fewer'),

  body('ownerName')
    .isString().withMessage('ownerName must be a string')
    .trim().notEmpty().withMessage('ownerName is required')
    .isLength({ max: 100 }).withMessage('ownerName must be 100 characters or fewer'),

  body('phoneNumber')
    .isString().withMessage('phoneNumber must be a string')
    .trim().notEmpty().withMessage('phoneNumber is required')
    .matches(PHONE_RE).withMessage('phoneNumber is not a valid phone number'),

  body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('email must be a valid email address')
    .isLength({ max: 255 }).withMessage('email is too long')
    .normalizeEmail(),

  body('location')
    .optional({ checkFalsy: true })
    .isString().withMessage('location must be a string')
    .isLength({ max: 200 }).withMessage('location must be 200 characters or fewer'),

  body('timezone')
    .optional({ checkFalsy: true })
    .isString().withMessage('timezone must be a string')
    .isLength({ max: 80 }).withMessage('timezone name is too long'),

  body('whatsapp_phone')
    .optional({ checkFalsy: true })
    .isString().withMessage('whatsapp_phone must be a string')
    .matches(PHONE_RE).withMessage('whatsapp_phone is not a valid phone number'),

  rejectIfInvalid,
];

/**
 * POST /api/auth/worker-login
 * Worker PIN login.
 */
const validateWorkerLogin = [
  body('business_code')
    .isString().withMessage('business_code must be a string')
    .trim().notEmpty().withMessage('business_code is required')
    .isLength({ max: 20 }).withMessage('business_code is too long')
    .matches(/^\d+$/).withMessage('business_code must contain only digits'),

  body('pin')
    .isString().withMessage('pin must be a string')
    .matches(/^\d{4}$/).withMessage('pin must be exactly 4 digits'),

  rejectIfInvalid,
];

/**
 * POST /api/auth/owner-pin/setup
 * POST /api/auth/owner-pin/verify
 * Owner (or co-founder) PIN setup / verification.
 */
const validateOwnerPin = [
  body('pin')
    .isString().withMessage('pin must be a string')
    .matches(/^\d{4}$/).withMessage('pin must be exactly 4 digits'),

  rejectIfInvalid,
];

/**
 * POST /api/workers
 * Add a new worker.
 */
const validateAddWorker = [
  body('worker_name')
    .isString().withMessage('worker_name must be a string')
    .trim().notEmpty().withMessage('worker_name is required')
    .isLength({ min: 2, max: 100 }).withMessage('worker_name must be 2–100 characters'),

  body('role')
    .optional({ checkFalsy: true })
    .isString().withMessage('role must be a string')
    .isIn(VALID_WORKER_ROLES)
    .withMessage(`role must be one of: ${VALID_WORKER_ROLES.join(', ')}`),

  body('pin')
    .optional({ checkFalsy: true })
    .isString().withMessage('pin must be a string')
    .matches(/^\d{4}$/).withMessage('pin must be exactly 4 digits'),

  body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('email must be a valid email address')
    .isLength({ max: 255 }).withMessage('email is too long')
    .normalizeEmail(),

  body('location_id')
    .optional({ checkFalsy: true })
    .isUUID().withMessage('location_id must be a valid UUID'),

  rejectIfInvalid,
];

/**
 * PUT /api/workers/:id
 * Update worker details.
 */
const validateUpdateWorker = [
  body('worker_name')
    .optional({ checkFalsy: true })
    .isString().withMessage('worker_name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('worker_name must be 2–100 characters'),

  body('pin')
    .optional({ checkFalsy: true })
    .isString().withMessage('pin must be a string')
    .matches(/^\d{4}$/).withMessage('pin must be exactly 4 digits'),

  body('role')
    .optional({ checkFalsy: true })
    .isString().withMessage('role must be a string')
    .isIn(VALID_WORKER_ROLES)
    .withMessage(`role must be one of: ${VALID_WORKER_ROLES.join(', ')}`),

  body('location_id')
    .optional({ checkFalsy: true })
    .isUUID().withMessage('location_id must be a valid UUID'),

  rejectIfInvalid,
];

/**
 * PATCH /api/auth/phone
 * Owner / co-founder: update notification WhatsApp phone.
 */
const validateUpdatePhone = [
  body('phone')
    .isString().withMessage('phone must be a string')
    .trim().notEmpty().withMessage('phone is required')
    .matches(PHONE_RE).withMessage('phone is not a valid phone number'),

  rejectIfInvalid,
];

module.exports = {
  validateRegister,
  validateWorkerLogin,
  validateOwnerPin,
  validateAddWorker,
  validateUpdateWorker,
  validateUpdatePhone,
};
