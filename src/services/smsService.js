const axios = require('axios');
const config = require('../config/env');

/**
 * Hubtel SMS Service for Ghana
 * API Documentation: https://developers.hubtel.com/documentations/sms-api
 */

class HubtelSMSService {
  constructor() {
    this.apiKey = process.env.HUBTEL_API_KEY;
    this.clientSecret = process.env.HUBTEL_CLIENT_SECRET;
    this.senderId = process.env.HUBTEL_SENDER_ID || 'SikaBuk';
    this.baseUrl = 'https://sms.hubtel.com/v1/messages';
  }

  /**
   * Send SMS via Hubtel API
   * @param {string} to - Phone number in format: 233XXXXXXXXX or 0XXXXXXXXX
   * @param {string} content - SMS message content (max 160 chars for single SMS)
   * @returns {Promise<object>} Hubtel API response
   */
  async sendSMS(to, content) {
    try {
      // Normalize Ghanaian phone number
      const phoneNumber = this.normalizeGhanaianPhone(to);

      // Prepare request
      const auth = Buffer.from(`${this.apiKey}:${this.clientSecret}`).toString('base64');
      
      const payload = {
        From: this.senderId,
        To: phoneNumber,
        Content: content,
        RegisteredDelivery: true // Request delivery report
      };

      console.log(`[Hubtel] Sending SMS to ${phoneNumber}...`);

      // Send request to Hubtel API
      const response = await axios.post(this.baseUrl + '/send', payload, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      console.log(`[Hubtel] SMS sent successfully. MessageId: ${response.data.MessageId}`);
      
      return {
        success: true,
        messageId: response.data.MessageId,
        status: response.data.Status,
        networkId: response.data.NetworkId
      };

    } catch (error) {
      console.error('[Hubtel] SMS sending failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.Message || error.message
      };
    }
  }

  /**
   * Send OTP SMS
   * @param {string} phone - Ghanaian phone number
   * @param {string} code - 6-digit OTP code
   * @param {string} purpose - 'registration' or 'login'
   * @returns {Promise<object>}
   */
  async sendOTP(phone, code, purpose = 'login') {
    const messages = {
      registration: `Welcome to SikaBuk! Your verification code is: ${code}. Valid for 5 minutes.`,
      login: `Your SikaBuk login code is: ${code}. Valid for 5 minutes. Do not share this code.`,
      reset: `Your SikaBuk password reset code is: ${code}. Valid for 5 minutes.`
    };

    const content = messages[purpose] || messages.login;
    
    return await this.sendSMS(phone, content);
  }

  /**
   * Normalize Ghanaian phone number to international format
   * Converts 0XXXXXXXXX to 233XXXXXXXXX
   * @param {string} phone - Phone number
   * @returns {string} Normalized phone in 233XXXXXXXXX format
   */
  normalizeGhanaianPhone(phone) {
    // Remove spaces, dashes, and plus signs
    let cleaned = phone.replace(/[\s\-+]/g, '');
    
    // If starts with 0, replace with 233
    if (cleaned.startsWith('0')) {
      cleaned = '233' + cleaned.substring(1);
    }
    
    // If doesn't start with 233, add it
    if (!cleaned.startsWith('233')) {
      cleaned = '233' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Check Hubtel account balance
   * @returns {Promise<object>}
   */
  async checkBalance() {
    try {
      const auth = Buffer.from(`${this.apiKey}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.get('https://sms.hubtel.com/v1/account/balance', {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      return {
        success: true,
        balance: response.data.Balance,
        currency: response.data.Currency
      };
    } catch (error) {
      console.error('[Hubtel] Balance check failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new HubtelSMSService();
