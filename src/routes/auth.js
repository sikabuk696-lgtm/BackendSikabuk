const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/permissions');
const {
  validateRegister,
  validateWorkerLogin,
  validateOwnerPin,
  validateUpdatePhone,
} = require('../middleware/validate');

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Strict limiter for PIN-based worker login (brute-force protection)
const workerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failures
});

// Moderate limiter for OAuth / registration flows
const authFlowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Light limiter for token verification (called on every page load)
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { success: false, error: 'Too many verify requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Business Registration - Create new business account
router.post('/register', authFlowLimiter, validateRegister, authController.registerBusiness);

// Owner: Verify Supabase access token (registration or login)
router.post('/supabase-auth', authFlowLimiter, authController.supabaseAuth);

// Worker: Login with PIN (strict rate limiting)
router.post('/worker-login', workerLoginLimiter, validateWorkerLogin, authController.workerLogin);

// Owner: Set security PIN (exchanges temp token for full JWT)
router.post('/owner-pin/setup', authFlowLimiter, validateOwnerPin, authController.setupOwnerPin);

// Owner: Verify security PIN (exchanges temp token for full JWT)
router.post('/owner-pin/verify', workerLoginLimiter, validateOwnerPin, authController.verifyOwnerPin);

// Verify JWT token (for protected routes)
router.get('/verify', verifyLimiter, authController.verifyToken);

// Owner/Co-founder: Update WhatsApp phone number for notifications
router.patch('/phone', authFlowLimiter, authenticate, ownerOnly, validateUpdatePhone, authController.updateOwnerPhone);

module.exports = router;
