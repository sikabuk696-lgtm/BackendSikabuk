const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { supabase } = require('../config/database');
const config = require('../config/env');

const PHONE_REGEX = /^0\d{9}$/;
const PIN_REGEX = /^\d{4}$/;
const SALT_ROUNDS = 10;

/**
 * Authentication Service - Multi-User Business Model
 * 
 * CEO/Owner: Authenticates via Firebase Phone Auth (handled in frontend)
 * Workers: Authenticate via PIN (business_id + 4-digit PIN)
 * 
 * JWT Payload: { businessId, workerId, role, workerName }
 */
class AuthService {
  /**
   * Generate a unique 6-digit short code for a business
   */
  async generateShortCode() {
    let attempts = 0;
    while (attempts < 20) {
      const code = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit, never starts with 0
      const { data: existing } = await supabase
        .from('business_accounts')
        .select('id')
        .eq('short_code', code)
        .single();
      if (!existing) return code;
      attempts++;
    }
    throw { status: 500, message: 'Failed to generate unique business code' };
  }

  /**
   * Register new business account
   * @param {Object} data - Business registration data
   * @returns {Object} Created business and owner info
   */
  async registerBusiness({ businessName, ownerName, phoneNumber, email, location, timezone }) {
    // Normalize phone number — store with full international prefix
    const normalizedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+233${phoneNumber.replace(/^0/, '')}`;
    
    // Check if business with this phone already exists
    const { data: existing } = await supabase
      .from('business_accounts')
      .select('id')
      .eq('owner_phone', normalizedPhone)
      .single();
    
    if (existing) {
      throw { status: 400, message: 'Business account with this phone number already exists' };
    }
    
    // Generate unique short code
    const shortCode = await this.generateShortCode();

    // Create business account (store timezone if provided)
    const { data: business, error: businessError } = await supabase
      .from('business_accounts')
      .insert([{
        business_name: businessName,
        owner_phone: normalizedPhone,
        owner_email: email || null,
        short_code: shortCode,
        is_active: true,
        timezone: timezone || 'UTC'
      }])
      .select()
      .single();

    if (businessError) {
      console.error('Business creation error:', businessError);
      const msg = businessError.message || JSON.stringify(businessError);
      if (msg.includes('value too long for type character varying') || msg.includes('character varying(15)')) {
        throw { status: 500, message: 'Database column `owner_phone` is too small for this value (likely storing email). Apply migration to add owner_email: database/07_add_owner_email_and_worker_email.sql' };
      }
      throw { status: 500, message: `Failed to create business account: ${msg}` };
    }

    // Create owner worker record
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .insert([{
        business_id: business.id,
        worker_name: ownerName,
        phone: normalizedPhone,
        email: email || null,
        role: 'owner',
        is_active: true
      }])
      .select('id, worker_name, role')
      .single();

    if (workerError) {
      console.error('Owner worker creation error:', workerError);
      throw { status: 500, message: `Failed to create owner worker account: ${workerError.message}` };
    }

    // Seed a default location using the business name so new accounts
    // start with at least one shop in the selector.
    await supabase
      .from('locations')
      .insert([{ business_id: business.id, name: businessName.trim(), is_active: true }]);

    // Create corresponding user record (for foreign key constraints)
    const { error: userError } = await supabase
      .from('users')
      .insert([{
        id: worker.id,  // Use same ID as worker
        business_id: business.id,
        name: ownerName,
        phone: normalizedPhone,
        role: 'owner'
      }]);
    
    if (userError) {
      console.log('Note: Users table insert skipped:', userError.message);
      // Don't throw error - users table might not exist or might be optional
    }
    
    // Generate JWT token
    const token = this.generateToken({
      businessId: business.id,
      workerId: worker.id,
      role: worker.role,
      workerName: worker.worker_name
    });
    
    return {
      owner: {
        id: business.id,
        business_id: business.id,
        short_code: business.short_code,
        business_name: business.business_name,
        owner_name: ownerName,
        phone_number: phoneNumber,
        worker_id: worker.id
      },
      token
    };
  }

  /**
   * Verify Supabase access token and authenticate owner (Google OAuth)
   * @param {string} accessToken - Supabase access token
   * @param {string} business_name - Business name (ONLY for new registration)
   * @returns {Object} Business account and auth token
   */
  async verifySupabaseToken({ accessToken, business_name, timezone, whatsapp_phone }) {
    if (!accessToken) {
      throw { status: 400, message: 'Supabase access token is required' };
    }

    // Verify token with Supabase and get user
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      throw { status: 401, message: 'Invalid or expired access token' };
    }

    // Extract email from Google OAuth user
    if (!user.email) {
      throw { status: 400, message: 'Email not found in authentication token' };
    }

    const email = user.email;
    const userName = user.user_metadata?.full_name || user.email.split('@')[0];

    // Check if business exists by email (prefer `owner_email`; support legacy `owner_phone` storing emails)
    let existingBusiness = null;
    // Try owner_email first (newer schema)
    const { data: byEmail } = await supabase
      .from('business_accounts')
      .select('id, business_name, short_code, is_active, owner_phone, owner_email, timezone, owner_security_pin_hash')
      .eq('owner_email', email)
      .single();
    if (byEmail) {
      existingBusiness = byEmail;
    } else {
      // Fallback for older records where email might be stored in owner_phone
      const { data: byPhone } = await supabase
        .from('business_accounts')
        .select('id, business_name, short_code, is_active, owner_phone, owner_email, timezone, owner_security_pin_hash')
        .eq('owner_phone', email)
        .single();
      existingBusiness = byPhone;
    }

    let business;
    let worker;
    let isNewBusiness = false;

    if (existingBusiness) {
      // ── EXISTING USER - LOGIN ──
      
      if (!existingBusiness.is_active) {
        throw { status: 403, message: 'Your business account has been deactivated. Contact support.' };
      }

      business = existingBusiness;

      // Get owner worker record
      const { data: ownerWorker } = await supabase
        .from('workers')
        .select('id, worker_name, role, is_active')
        .eq('business_id', business.id)
        .eq('role', 'owner')
        .single();

      if (!ownerWorker || !ownerWorker.is_active) {
        throw { status: 403, message: 'Owner account not found or inactive' };
      }

      worker = ownerWorker;

      // Update last login
      await supabase
        .from('workers')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', worker.id);

    } else {
      // ── NOT AN OWNER — check if this email belongs to a co-founder worker ──
      const { data: cofounderWorker } = await supabase
        .from('workers')
        .select('id, business_id, worker_name, role, pin_hash, is_active')
        .eq('email', email)
        .eq('role', 'cofounder')
        .eq('is_active', true)
        .single();

      if (cofounderWorker) {
        // ── CO-FOUNDER LOGIN ──
        const { data: cofounderBusiness } = await supabase
          .from('business_accounts')
          .select('id, business_name, short_code, is_active, owner_phone, timezone')
          .eq('id', cofounderWorker.business_id)
          .single();

        if (!cofounderBusiness || !cofounderBusiness.is_active) {
          throw { status: 403, message: 'Business account is not active.' };
        }

        business = cofounderBusiness;
        worker   = cofounderWorker;

        // Update last login
        await supabase
          .from('workers')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', worker.id);

        // Co-founder PIN is stored in workers.pin_hash
        const cofPinHash   = worker.pin_hash || null;
        const cofPinStatus = cofPinHash ? 'verify_required' : 'setup_required';

        const tempToken = this.generateTempToken({
          businessId: business.id,
          workerId:   worker.id,
          role:       worker.role,
          workerName: worker.worker_name,
        });

        return {
          success:       true,
          isNewBusiness: false,
          pinStatus:     cofPinStatus,
          tempToken,
          business: {
            id:            business.id,
            short_code:    business.short_code,
            business_name: business.business_name,
          },
          worker: {
            id:   worker.id,
            name: worker.worker_name,
            role: worker.role,
          },
        };
      }

      // ── NEW USER - REGISTRATION ──

      // If no business name was provided, this is a login attempt from a
      // Google account that has never registered — block it with a clear message.
      if (!business_name || business_name.trim().length < 2) {
        throw { status: 404, message: 'No SikaBuk account found for this Google account. Please register your business first.' };
      }

      isNewBusiness = true;

      // Generate unique short code
      const shortCode = await this.generateShortCode();

      // Create business account (store owner email in `owner_email`)
      const insertBiz = {
        business_name: business_name.trim(),
        owner_email: email, // store owner's email in dedicated column
        short_code: shortCode,
        is_active: true,
        timezone: timezone || 'UTC',
      };

      // Optionally store WhatsApp number for notifications
      if (whatsapp_phone) {
        let cleaned = whatsapp_phone.replace(/[\s\-+]/g, '');
        if (cleaned.startsWith('0')) cleaned = '233' + cleaned.substring(1);
        if (/^\d{10,15}$/.test(cleaned)) insertBiz.owner_phone = cleaned;
      }

      const { data: newBusiness, error: businessError } = await supabase
        .from('business_accounts')
        .insert([insertBiz])
        .select('id, business_name, short_code, timezone')
        .single();

      if (businessError) {
        console.error('Business creation error:', businessError);
        const msg = businessError.message || JSON.stringify(businessError);
        // Common schema-related failures and helpful guidance
        if (msg.includes('owner_email') || msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist')) {
          throw { status: 500, message: 'Database schema is missing OAuth columns (owner_email / workers.email). Run the migration: database/07_add_owner_email_and_worker_email.sql' };
        }
        if (msg.includes('value too long for type character varying') || msg.includes('character varying(15)')) {
          throw { status: 500, message: 'Registration failed because the database column for owner phone is too small to store OAuth emails. Run the migration to add owner_email (see database/07_add_owner_email_and_worker_email.sql).' };
        }
        throw { status: 500, message: `Failed to create business account: ${msg}`, details: businessError };
      }

      business = newBusiness;

      // Create owner worker record
      const { data: newWorker, error: workerError} = await supabase
        .from('workers')
        .insert([{
          business_id: business.id,
          worker_name: userName,
          email: email, // store owner's email in dedicated column
          role: 'owner',
          is_active: true
        }])
        .select('id, worker_name, role')
        .single();

      if (workerError) {
        console.error('Owner worker creation error:', workerError);
        throw { status: 500, message: `Failed to create owner account: ${workerError.message || JSON.stringify(workerError)}`, details: workerError };
      }

      worker = newWorker;

      // Seed a default location using the business name so new accounts
      // start with at least one shop in the selector.
      await supabase
        .from('locations')
        .insert([{ business_id: business.id, name: business_name.trim(), is_active: true }]);
    }

    // ── Security PIN gate (applies to all Google OAuth owners) ──────
    // For co-founders, PIN hash lives in workers.pin_hash (handled above in
    // the co-founder branch). This block only runs for the business owner.
    const pinHash   = business.owner_security_pin_hash || null;
    const pinStatus = pinHash ? 'verify_required' : 'setup_required';

    const tempToken = this.generateTempToken({
      businessId:  business.id,
      workerId:    worker.id,
      role:        worker.role,
      workerName:  worker.worker_name,
    });

    return {
      success: true,
      isNewBusiness,
      pinStatus,
      tempToken,
      business: {
        id: business.id,
        short_code: business.short_code,
        business_name: business.business_name
      },
      worker: {
        id: worker.id,
        name: worker.worker_name,
        role: worker.role
      },
    };
  }

  /**
   * Worker login with PIN (for employees on authenticated device)
   * @param {string} business_code - 6-digit business short code
   * @param {string} pin - 4-digit PIN
   */
  async workerLogin({ business_code, pin }) {
    // Validate inputs
    if (!business_code || !pin) {
      throw { status: 400, message: 'Business Code and PIN are required' };
    }

    if (!PIN_REGEX.test(pin)) {
      throw { status: 400, message: 'PIN must be exactly 4 digits' };
    }

    // Look up business by short code
    const { data: business } = await supabase
      .from('business_accounts')
      .select('id')
      .eq('short_code', business_code)
      .single();

    if (!business) {
      throw { status: 404, message: 'Business not found. Check the code and try again.' };
    }

    // Get all active workers for this business (exclude owner and cofounder — they use Google OAuth)
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('id, business_id, worker_name, role, pin_hash, is_active')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .neq('role', 'owner')
      .neq('role', 'cofounder'); // Co-founders must log in via Google OAuth

    if (workersError || !workers || workers.length === 0) {
      throw { status: 401, message: 'No workers found for this business' };
    }

    // Try to match PIN with any worker
    let matchedWorker = null;
    for (const worker of workers) {
      if (worker.pin_hash) {
        const isValidPin = await bcrypt.compare(pin, worker.pin_hash);
        if (isValidPin) {
          matchedWorker = worker;
          break;
        }
      }
    }

    if (!matchedWorker) {
      throw { status: 401, message: 'Invalid PIN' };
    }

    // Update last login
    await supabase
      .from('workers')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', matchedWorker.id);

    // Generate JWT
    const token = this.generateToken({
      businessId: matchedWorker.business_id,
      workerId: matchedWorker.id,
      role: matchedWorker.role,
      workerName: matchedWorker.worker_name
    });

    return {
      message: `Welcome back, ${matchedWorker.worker_name}!`,
      worker: {
        id: matchedWorker.id,
        worker_name: matchedWorker.worker_name,
        role: matchedWorker.role,
        business_id: matchedWorker.business_id
      },
      token
    };
  }

  /**
   * Generate a short-lived temporary token used during PIN setup / verification.
   * Claims include type='pin_pending' so the PIN endpoints can reject any other token.
   */
  generateTempToken(payload) {
    return jwt.sign(
      { ...payload, type: 'pin_pending' },
      config.jwt.secret,
      { expiresIn: '15m' }
    );
  }

  /**
   * Set (or reset) the owner security PIN.
   * Requires a valid pin_pending temp token.
   * @param {string} tempToken - Short-lived token from supabase-auth
   * @param {string} newPin    - 4-digit numeric PIN chosen by the owner
   */
  async setupOwnerPin({ tempToken, newPin }) {
    if (!tempToken) throw { status: 401, message: 'Authentication token required' };
    if (!PIN_REGEX.test(newPin)) throw { status: 400, message: 'PIN must be exactly 4 digits' };

    let decoded;
    try {
      decoded = jwt.verify(tempToken, config.jwt.secret);
    } catch (_) {
      throw { status: 401, message: 'Token expired or invalid. Please sign in with Google again.' };
    }
    if (decoded.type !== 'pin_pending') {
      throw { status: 403, message: 'Invalid token type for PIN setup' };
    }

    const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);

    if (decoded.role === 'cofounder') {
      // Co-founder PIN stored in workers.pin_hash
      const { error } = await supabase
        .from('workers')
        .update({ pin_hash: pinHash })
        .eq('id', decoded.workerId);
      if (error) throw { status: 500, message: 'Failed to save PIN' };
    } else {
      // Owner PIN stored in business_accounts.owner_security_pin_hash
      const { error } = await supabase
        .from('business_accounts')
        .update({ owner_security_pin_hash: pinHash })
        .eq('id', decoded.businessId);
      if (error) throw { status: 500, message: 'Failed to save PIN' };
    }

    // Issue full JWT
    const token = this.generateToken({
      businessId: decoded.businessId,
      workerId:   decoded.workerId,
      role:       decoded.role,
      workerName: decoded.workerName,
    });
    return { success: true, token };
  }

  /**
   * Verify the owner security PIN.
   * @param {string} tempToken - pin_pending token from supabase-auth
   * @param {string} pin       - 4-digit PIN entered by the owner
   */
  async verifyOwnerPin({ tempToken, pin }) {
    if (!tempToken) throw { status: 401, message: 'Authentication token required' };
    if (!PIN_REGEX.test(pin)) throw { status: 400, message: 'PIN must be exactly 4 digits' };

    let decoded;
    try {
      decoded = jwt.verify(tempToken, config.jwt.secret);
    } catch (_) {
      throw { status: 401, message: 'Session expired. Please sign in with Google again.' };
    }
    if (decoded.type !== 'pin_pending') {
      throw { status: 403, message: 'Invalid token type for PIN verification' };
    }

    // Load PIN hash — co-founders use workers.pin_hash; owners use business_accounts
    let storedPinHash;
    if (decoded.role === 'cofounder') {
      const { data: wrkr, error: wErr } = await supabase
        .from('workers')
        .select('pin_hash')
        .eq('id', decoded.workerId)
        .single();
      if (wErr || !wrkr) throw { status: 404, message: 'Worker account not found' };
      if (!wrkr.pin_hash) throw { status: 400, message: 'No PIN set. Please set up your PIN first.' };
      storedPinHash = wrkr.pin_hash;
    } else {
      const { data: biz, error } = await supabase
        .from('business_accounts')
        .select('owner_security_pin_hash')
        .eq('id', decoded.businessId)
        .single();
      if (error || !biz) throw { status: 404, message: 'Business account not found' };
      if (!biz.owner_security_pin_hash) {
        throw { status: 400, message: 'No PIN set. Please set up your PIN first.' };
      }
      storedPinHash = biz.owner_security_pin_hash;
    }

    const valid = await bcrypt.compare(pin, storedPinHash);
    if (!valid) throw { status: 401, message: 'Incorrect PIN. Please try again.' };

    // Issue full JWT
    const token = this.generateToken({
      businessId: decoded.businessId,
      workerId:   decoded.workerId,
      role:       decoded.role,
      workerName: decoded.workerName,
    });
    return { success: true, token };
  }

  /**
   * Generate JWT token with business context
   * @param {object} payload - { businessId, workerId, role, workerName }
   */
  generateToken(payload) {
    return jwt.sign(
      payload,
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw { status: 401, message: 'Invalid or expired token' };
    }
  }
}

module.exports = new AuthService();
