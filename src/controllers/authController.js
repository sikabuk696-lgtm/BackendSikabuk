const authService = require('../services/authService');
const { safeMessage } = require('../utils/errors');

/**
 * Authentication Controller - Multi-User Business Model
 * 
 * Business Registration: Create new business account
 * Owner Authentication: Firebase Phone Auth (handled in frontend, verified here)
 * Worker Authentication: PIN-based (4-digit code)
 */
class AuthController {
  /**
   * Register new business account
   * POST /api/auth/register
   * Body: { businessName, ownerName, phoneNumber, email, location }
   */
  async registerBusiness(req, res) {
    try {
      const { businessName, ownerName, phoneNumber, email, location, timezone } = req.body;
    
      // Validate required fields
      if (!businessName || !ownerName || !phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'businessName, ownerName, and phoneNumber are required'
        });
      }
    
      const result = await authService.registerBusiness({
        businessName,
        ownerName,
        phoneNumber,
        email,
        location,
        timezone
      });
      
      res.status(201).json({
        success: true,
        message: 'Business account created successfully',
        owner: result.owner,
        token: result.token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(error.status || 500).json({
        success: false,
        error: safeMessage(error, 'Registration failed')
      });
    }
  }

  /**
   * Verify Supabase access token and authenticate owner
   * POST /api/auth/supabase-auth
   * Body: { accessToken, business_name (optional, for new businesses) }
   */
  async supabaseAuth(req, res) {
    const start = Date.now();
    if (process.env.NODE_ENV === 'development') {
      // Omit body from log — it contains the raw OAuth accessToken
      console.log('[AuthController] supabaseAuth called');
    }
    try {
      const { accessToken, business_name, timezone, whatsapp_phone } = req.body;
    
      const result = await authService.verifySupabaseToken({ 
        accessToken, 
        business_name,
        timezone,
        whatsapp_phone,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthController] supabaseAuth completed in', Date.now() - start, 'ms, isNewBusiness=', result?.isNewBusiness);
      }

      const statusCode = result.isNewBusiness ? 201 : 200;

      res.status(statusCode).json({
        success: true,
        message: result.isNewBusiness ? 'Account created! Set up your security PIN to continue.' : 'Please verify your security PIN.',
        data: {
          business:     result.business,
          worker:       result.worker,
          tempToken:    result.tempToken,
          pinStatus:    result.pinStatus,   // 'setup_required' | 'verify_required'
          isNewBusiness: result.isNewBusiness,
        }
      });
    } catch (error) {
      console.error('supabaseAuth error:', error);
      const status = error.status || 500;
      const payload = {
        success: false,
        message: safeMessage(error, 'Authentication failed')
      };
      if (process.env.NODE_ENV === 'development') {
        payload.details = error.stack || error;
      }
      res.status(status).json(payload);
    }
  }

  /**
   * POST /api/auth/owner-pin/setup
   * Set up the owner security PIN (for first-time or PIN reset).
   * Body: { tempToken, pin }
   */
  async setupOwnerPin(req, res) {
    try {
      const { tempToken, pin } = req.body;
      const result = await authService.setupOwnerPin({ tempToken, newPin: pin });
      res.status(200).json({
        success: true,
        message: 'Security PIN set successfully. Welcome to ₵ikaBuk!',
        data: { token: result.token }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: safeMessage(error, 'Failed to set PIN')
      });
    }
  }

  /**
   * POST /api/auth/owner-pin/verify
   * Verify the owner security PIN and exchange for a full JWT.
   * Body: { tempToken, pin }
   */
  async verifyOwnerPin(req, res) {
    try {
      const { tempToken, pin } = req.body;
      const result = await authService.verifyOwnerPin({ tempToken, pin });
      res.status(200).json({
        success: true,
        message: 'PIN verified. Welcome back!',
        data: { token: result.token }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: safeMessage(error, 'PIN verification failed')
      });
    }
  }

  /**
   * Worker login with PIN (for employees)
   * POST /api/auth/worker-login
   * Body: { business_code, pin }
   */
  async workerLogin(req, res) {
    try {
      const { business_code, pin } = req.body;
      
      const result = await authService.workerLogin({ 
        business_code, 
        pin 
      });

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          worker: result.worker,
          token: result.token
        }
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Worker login failed')
      });
    }
  }

  /**
   * Verify JWT token (for protected routes)
   * GET /api/auth/verify
   */
  async verifyToken(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      const decoded = authService.verifyToken(token);

      // Fetch short_code and business_name for the business
      let shortCode = null;
      let businessName = null;
      if (decoded.businessId) {
        const { supabase } = require('../config/database');
        const { data: biz } = await supabase
          .from('business_accounts')
          .select('short_code, business_name')
          .eq('id', decoded.businessId)
          .single();
        shortCode = biz?.short_code || null;
        businessName = biz?.business_name || null;
      }

      // If JWT represents a worker, include assigned location_id for client-side UI & defaults
      let workerLocation = null;
      if (decoded.workerId) {
        try {
          const { supabase } = require('../config/database');
          const { data: w } = await supabase
            .from('workers')
            .select('location_id')
            .eq('id', decoded.workerId)
            .eq('business_id', decoded.businessId)
            .single();
          workerLocation = w?.location_id || null;
        } catch (err) {
          workerLocation = null;
        }
      }

      res.status(200).json({
        success: true,
        data: { 
          businessId: decoded.businessId,
          shortCode,
          businessName,
          workerId: decoded.workerId,
          role: decoded.role,
          workerName: decoded.workerName,
          locationId: workerLocation,
          valid: true 
        }
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error.message || 'Invalid token'
      });
    }
  }

  /**
   * Update owner WhatsApp phone number (used for notifications).
   * PATCH /api/auth/phone
   * Auth: owner / cofounder only
   * Body: { phone }
   */
  async updateOwnerPhone(req, res) {
    try {
      const { phone } = req.body;
      const businessId = req.businessId;

      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ success: false, message: 'Phone number is required' });
      }

      // Basic Ghanaian phone validation
      const cleaned = phone.replace(/[\s\-+]/g, '');
      if (!/^\d{10,15}$/.test(cleaned)) {
        return res.status(400).json({ success: false, message: 'Enter a valid Ghanaian phone number (e.g. 0201234567)' });
      }

      const normalized = cleaned.startsWith('0') ? '233' + cleaned.substring(1) : cleaned;

      const { supabase } = require('../config/database');
      const { error } = await supabase
        .from('business_accounts')
        .update({ owner_phone: normalized })
        .eq('id', businessId);

      if (error) return res.status(500).json({ success: false, message: 'Failed to update phone' });

      return res.status(200).json({ success: true, message: 'WhatsApp number updated', phone: normalized });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: safeMessage(error, 'Failed to update phone') });
    }
  }
}

module.exports = new AuthController();
