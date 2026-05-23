const { supabase } = require('../config/database');

/**
 * GET /api/notifications
 * Returns the most recent notifications for this business,
 * excluding actions the requesting worker performed themselves.
 */
async function getNotifications(req, res) {
  try {
    const { businessId, workerId } = req;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .neq('actor_id', workerId)        // don't show your own actions
      .order('created_at', { ascending: false })
      .limit(limit);

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
    const { businessId, workerId } = req;

    // Fetch all unread-by-this-worker notifications
    const { data, error } = await supabase
      .from('notifications')
      .select('id, read_by')
      .eq('business_id', businessId)
      .neq('actor_id', workerId);

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
