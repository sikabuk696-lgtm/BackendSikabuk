const pendingService = require('../services/pendingService');
const { safeMessage } = require('../utils/errors');

/**
 * Pending Changes Controller
 * All endpoints are owner-only (enforced in the router via ownerOnly middleware).
 */

/**
 * GET /api/pending/mine
 * Worker fetches their own pending submissions (any status).
 * Filtered by entity_type=product by default; pass ?entityType=customer etc.
 */
async function myChanges(req, res) {
  try {
    const { entityType, status } = req.query;
    const result = await pendingService.listPendingChanges(req.businessId, {
      status:     status || 'pending',
      entityType: entityType || null,
      workerId:   req.workerId,   // restrict to this worker only
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: safeMessage(err, 'Failed to load your submissions') });
  }
}

/**
 * GET /api/pending
 * List pending (or historical) changes for the business.
 * Query: ?status=pending|approved|rejected  &entityType=product|customer
 */
async function list(req, res) {
  try {
    const { status, entityType } = req.query;
    const result = await pendingService.listPendingChanges(req.businessId, { status, entityType });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: safeMessage(err, 'Failed to load approvals') });
  }
}

/**
 * GET /api/pending/count
 * Return the number of pending (unreviewed) changes — used for the sidebar badge.
 */
async function count(req, res) {
  try {
    const n = await pendingService.countPending(req.businessId);
    res.json({ success: true, count: n });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMessage(err, 'Failed to count approvals') });
  }
}

/**
 * POST /api/pending/:id/approve
 * Approve a pending change — applies the mutation to the real table.
 */
async function approve(req, res) {
  try {
    const result = await pendingService.approveChange(req.businessId, req.workerId, req.params.id);
    res.json({ success: true, message: 'Change approved and applied.', result: result.result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: safeMessage(err, 'Approval failed') });
  }
}

/**
 * POST /api/pending/:id/reject
 * Reject a pending change (stores an optional reason).
 * Body: { reason? }
 */
async function reject(req, res) {
  try {
    const { reason } = req.body;
    const result = await pendingService.rejectChange(req.businessId, req.workerId, req.params.id, reason);
    res.json({ success: true, message: 'Change rejected.', change: result.change });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: safeMessage(err, 'Rejection failed') });
  }
}

module.exports = { list, count, approve, reject };
