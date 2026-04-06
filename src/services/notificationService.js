const { supabase } = require('../config/database');
const whatsappService = require('./whatsappService');

/**
 * Notification Service
 *
 * Sends WhatsApp notifications to the business owner whenever a worker
 * submits a pending change request or a co-founder performs a direct action.
 *
 * All methods fail silently — a notification failure must never break the
 * primary business operation that triggered it.
 */

/**
 * Build the message sent when a worker submits something for approval.
 * @param {string} workerName
 * @param {string} entityType  – 'product' | 'customer'
 * @param {string} action      – 'create' | 'update' | 'delete' | 'stock'
 * @returns {string}
 */
function pendingSubmissionMsg(workerName, entityType, action) {
  const actionLabel = {
    create: 'added a new',
    update: 'updated a',
    delete: 'requested to delete a',
    stock:  'adjusted stock for a',
  }[action] || 'modified a';

  return (
    `[SikaBuk] ${workerName} ${actionLabel} ${entityType} — ` +
    `pending your approval. Log in to review.`
  );
}

/**
 * Build the message sent when a co-founder performs a direct action.
 * @param {string} cofounderName
 * @param {string} entityType
 * @param {string} action
 * @param {string} entityName
 * @returns {string}
 */
function cofounderActionMsg(cofounderName, entityType, action, entityName) {
  return (
    `[SikaBuk] Co-founder ${cofounderName} ${action}d ${entityType} "${entityName || ''}". ` +
    `No approval needed — already applied.`
  );
}

/**
 * Send a WhatsApp notification to the owner of a business.
 * Fetches the owner's phone from business_accounts.owner_phone.
 * Skips silently if owner_phone is not set or WhatsApp is unconfigured.
 *
 * @param {string} businessId
 * @param {string} message
 */
async function notifyOwner(businessId, message) {
  try {
    const { data: biz } = await supabase
      .from('business_accounts')
      .select('owner_phone')
      .eq('id', businessId)
      .single();

    const ownerPhone = biz?.owner_phone;
    if (!ownerPhone) return; // phone not set — skip silently

    await whatsappService.sendWhatsApp(ownerPhone, message);
  } catch (err) {
    // Never propagate — notification failure must not affect the request
    console.error('[notifyOwner] Failed silently:', err?.message || err);
  }
}

module.exports = { notifyOwner, pendingSubmissionMsg, cofounderActionMsg };
