const { supabase } = require('../config/database');

/**
 * Notification types that regular workers (non-owner, non-cofounder) are
 * allowed to see. Operational updates only — no management/financial data.
 *
 * Workers CAN see:
 *   sale_created        — someone on the team recorded a sale
 *   product_added       — new product added to inventory
 *   product_updated     — a product was updated
 *   product_deleted     — a product was removed from inventory
 *   customer_added      — a new customer was added
 *
 * Workers CANNOT see:
 *   expense_added       — financial data (management only)
 *   worker_added        — team hiring decisions (management only)
 *   product_pending     — approval workflow (owner/cofounder only)
 *   customer_pending    — approval workflow (owner/cofounder only)
 *   daily_batch_approved — batch approval workflow (owner/cofounder only)
 */
const WORKER_ALLOWED_TYPES = [
  'sale_created',
  'product_added',
  'product_updated',
  'product_deleted',
  'customer_added',
];

const MANAGEMENT_ROLES = ['owner', 'cofounder'];

/**
 * GET /api/notifications
 * Returns the most recent notifications for this business,
 * excluding actions the requesting worker performed themselves.
 * Workers receive a filtered subset; owners/cofounders see everything.
 */
async function getNotifications(req, res) {
  try {
    const { businessId, workerId, role } = req;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .neq('actor_id', workerId)        // don't show your own actions
      .order('created_at', { ascending: false })
      .limit(limit);

    // Regular workers only see operational notification types
    if (!MANAGEMENT_ROLES.includes(role)) {
      query = query.in('type', WORKER_ALLOWED_TYPES);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[getNotifications]', error.message);
      return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }

    return res.json({ success: true, notifications: data || [] });
  } catch (err) {
    console.error('[getNotifications] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read by the requesting worker.
 */
async function markRead(req, res) {
  try {
    const { businessId, workerId } = req;
    const { id } = req.params;

    // Fetch existing read_by list
    const { data: existing, error: fetchErr } = await supabase
      .from('notifications')
      .select('read_by')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    const readBy = existing.read_by || [];
    if (!readBy.includes(workerId)) {
      const { error: updateErr } = await supabase
        .from('notifications')
        .update({ read_by: [...readBy, workerId] })
        .eq('id', id);

      if (updateErr) {
        return res.status(500).json({ success: false, error: 'Failed to mark as read' });
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[markRead] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * PATCH /api/notifications/mark-all-read
 * Marks all notifications (for this business, not created by this worker)
 * as read by the requesting worker.
 */
async function markAllRead(req, res) {
  try {
    const { businessId, workerId, role } = req;

    // Fetch notifications for this business, not created by this worker
    let query = supabase
      .from('notifications')
      .select('id, read_by')
      .eq('business_id', businessId)
      .neq('actor_id', workerId);

    // Apply the same type filter as getNotifications
    if (!MANAGEMENT_ROLES.includes(role)) {
      query = query.in('type', WORKER_ALLOWED_TYPES);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }

    const toUpdate = (data || []).filter(n => !(n.read_by || []).includes(workerId));

    await Promise.all(
      toUpdate.map(n =>
        supabase
          .from('notifications')
          .update({ read_by: [...(n.read_by || []), workerId] })
          .eq('id', n.id)
      )
    );

    return res.json({ success: true, updated: toUpdate.length });
  } catch (err) {
    console.error('[markAllRead] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = { getNotifications, markRead, markAllRead };
