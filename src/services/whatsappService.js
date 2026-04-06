const axios = require('axios');

/**
 * Hubtel WhatsApp Service
 * Sends WhatsApp messages via Hubtel's Business Messaging API.
 * Mirrors the structure of smsService.js.
 *
 * Required environment variables (optional — notifications degrade gracefully):
 *   HUBTEL_WHATSAPP_API_KEY    – Hubtel API key for WhatsApp channel
 *   HUBTEL_WHATSAPP_CLIENT_SECRET – Hubtel client secret
 *   HUBTEL_WHATSAPP_SENDER_ID  – Approved sender ID / phone number
 */
class HubtelWhatsAppService {
  constructor() {
    this.apiKey       = process.env.HUBTEL_WHATSAPP_API_KEY;
    this.clientSecret = process.env.HUBTEL_WHATSAPP_CLIENT_SECRET;
    this.senderId     = process.env.HUBTEL_WHATSAPP_SENDER_ID || 'SikaBuk';
    this.baseUrl      = 'https://api.hubtel.com/v1/whatsapp/messages';
  }

  /**
   * Send a WhatsApp message.
   * @param {string} to      – Recipient phone number (Ghanaian format accepted)
   * @param {string} message – Plain-text message body
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendWhatsApp(to, message) {
    if (!this.apiKey || !this.clientSecret) {
      console.warn('[WhatsApp] Skipping — HUBTEL_WHATSAPP_API_KEY not configured');
      return { success: false, error: 'WhatsApp not configured' };
    }

    try {
      const phoneNumber = this.normalizeGhanaianPhone(to);
      const auth = Buffer.from(`${this.apiKey}:${this.clientSecret}`).toString('base64');

      const payload = {
        from:    this.senderId,
        to:      phoneNumber,
        content: { type: 'text', text: message },
      };

      const response = await axios.post(this.baseUrl + '/send', payload, {
        headers: {
          Authorization:  `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`[WhatsApp] Sent to ${phoneNumber}. MessageId: ${response.data?.messageId}`);
      return { success: true, messageId: response.data?.messageId };
    } catch (error) {
      console.error('[WhatsApp] Send failed:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Normalize Ghanaian phone number to international format (233XXXXXXXXX).
   * @param {string} phone
   * @returns {string}
   */
  normalizeGhanaianPhone(phone) {
    let cleaned = phone.replace(/[\s\-+]/g, '');
    if (cleaned.startsWith('0')) cleaned = '233' + cleaned.substring(1);
    if (!cleaned.startsWith('233'))  cleaned = '233' + cleaned;
    return cleaned;
  }
}

module.exports = new HubtelWhatsAppService();
