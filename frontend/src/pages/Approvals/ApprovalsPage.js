import React, { useState, useEffect, useCallback } from 'react';
import { pendingAPI } from '../../services/api';
import { useCurrency } from '../../context/CurrencyContext';
import { formatMoney } from '../../utils/helpers';
import toast from '../../utils/notify';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineClock, HiOutlineCube, HiOutlineUsers } from 'react-icons/hi';
import './Approvals.css';

const ACTION_LABELS = {
  create: 'New',
  update: 'Edit',
  delete: 'Delete',
  stock:  'Stock',
};

const ACTION_COLORS = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  stock:  'purple',
};

/* Column definitions per entity_type + action */
const PAYLOAD_COLS = {
  product: {
    create: [
      { key: 'name',            label: 'Name' },
      { key: 'cost_price',      label: 'Cost Price',      format: formatMoney },
      { key: 'selling_price',   label: 'Selling Price',   format: formatMoney },
      { key: 'quantity',        label: 'Stock',           format: v => `${v} units` },
      { key: 'low_stock_alert', label: 'Low Stock Alert', format: v => `${v} units` },
    ],
    update: [
      { key: 'name',              label: 'Name' },
      { key: 'cost_price',        label: 'Cost Price',      format: formatMoney },
      { key: 'selling_price',     label: 'Selling Price',   format: formatMoney },
      { key: 'previous_quantity', label: 'Previous Stock',  format: v => `${v} units` },
      { key: 'quantity',          label: 'New Stock',       format: v => `${v} units` },
      { key: '_qty_change',       label: 'Change',          compute: p => { const diff = (p.quantity ?? 0) - (p.previous_quantity ?? 0); return diff === 0 ? 'No change' : (diff > 0 ? `+${diff}` : String(diff)) + ' units'; } },
      { key: 'low_stock_alert',   label: 'Low Stock Alert', format: v => `${v} units` },
    ],
    stock: [
      { key: '_name',             label: 'Product' },
      { key: 'previous_quantity', label: 'Previous Units', format: v => `${v} units` },
      { key: 'change',            label: 'Units Added / Removed', format: v => (v > 0 ? `+${v}` : String(v)) + ' units' },
      { key: 'total_quantity',    label: 'Total Units', format: v => `${v} units` },
    ],
  },
  customer: {
    create: [
      { key: 'name',       label: 'Name' },
      { key: 'phone',      label: 'Phone',       format: v => v || '—' },
      { key: 'total_debt', label: 'Amount Owed', format: formatMoney },
    ],
    update: [
      { key: 'name',       label: 'Name' },
      { key: 'phone',      label: 'Phone',       format: v => v || '—' },
      { key: 'total_debt', label: 'Amount Owed', format: formatMoney },
    ],
  },
};

function PayloadTable({ payload, action, entityType, entityName }) {
  if (!payload) return null;

  if (action === 'delete') {
    return (
      <div className="batch-expanded-section">
        <div className="batch-expanded-header">
          <h4 style={{ margin: 0, fontWeight: 800 }}>Deletion Request</h4>
        </div>
        <div className="ac-payload-delete-note">
          Worker is requesting permanent deletion of this item.
        </div>
      </div>
    );
  }

  const cols = ((PAYLOAD_COLS[entityType] || {})[action] || []);

  if (cols.length === 0) return null;

  const getVal = (col) => {
    if (col.compute) return col.compute(payload);
    if (col.key === '_name') return entityName || '—';
    const raw = payload[col.key];
    if (raw === undefined || raw === null) return '—';
    return col.format ? col.format(raw) : String(raw);
  };

  return (
    <div className="batch-expanded-section">
      <div className="batch-expanded-header">
        <h4 style={{ margin: 0, fontWeight: 800 }}>Submitted Changes</h4>
      </div>
      <div className="table-container extended-table-container">
        <table className="data-table expanded-sales-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              {cols.map(col => <th key={col.key}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="expanded-row-item">
              {cols.map(col => <td key={col.key}>{getVal(col)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const { currency } = useCurrency();
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectId,      setRejectId]      = useState(null);
  const [rejectReason,  setRejectReason]  = useState('');
  const [approvingAll,  setApprovingAll]  = useState(false);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'approved' | 'rejected'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await pendingAPI.list({ status: filter });
      setChanges(data.changes || []);
    } catch {
      toast.error('Failed to load pending changes');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Silent background refresh — no loading spinner, updates list every 15s
  const silentRefresh = useCallback(async () => {
    try {
      const { data } = await pendingAPI.list({ status: filter });
      setChanges(data.changes || []);
    } catch {
      // silently ignore polling errors
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(silentRefresh, 15000);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  const handleApprove = async (id) => {
    try {
      await pendingAPI.approve(id);
      toast.success('Change approved and applied!');
      load();
      // Tell sidebar badge to refresh
      window.dispatchEvent(new Event('sikabuk:pendingChanged'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    try {
      await pendingAPI.reject(rejectId, rejectReason.trim() || undefined);
      toast.success('Change rejected');
      setRejectId(null);
      setRejectReason('');
      load();
      window.dispatchEvent(new Event('sikabuk:pendingChanged'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Rejection failed');
    }
  };

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const { data } = await pendingAPI.approveAll();
      toast.success(data.message || 'All changes approved');
      load();
      window.dispatchEvent(new Event('sikabuk:pendingChanged'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approve-all failed');
    } finally {
      setApprovingAll(false);
    }
  };

  const pendingCount = changes.filter(c => c.status === 'pending').length;

  return (
    <div className="approvals-page" data-currency={currency}>
      {/* Header */}
      <div className="approvals-header">
        <div>
          <h1 className="approvals-title">Approval Queue</h1>
          <p className="approvals-subtitle">
            Review and approve changes submitted by your workers before they take effect.
          </p>
        </div>
        {filter === 'pending' && pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="approvals-badge-lg">{pendingCount} pending</div>
            <button
              className="btn btn-primary"
              onClick={handleApproveAll}
              disabled={approvingAll}
              title="Approve every pending change at once"
            >
              <HiOutlineCheckCircle style={{ marginRight: 6 }} />
              {approvingAll ? 'Approving…' : 'Approve All'}
            </button>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="approvals-tabs">
        {['pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            className={`approvals-tab ${filter === s ? 'active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="approvals-empty">Loading…</div>
      ) : changes.length === 0 ? (
        <div className="approvals-empty">
          <HiOutlineClock size={40} className="approvals-empty-icon" />
          <p>No {filter} changes</p>
        </div>
      ) : (
        <div className="approvals-list">
          {changes.map(c => (
            <ApprovalCard
              key={c.id}
              change={c}
              onApprove={handleApprove}
              onReject={(id) => { setRejectId(id); setRejectReason(''); }}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="approvals-overlay" onClick={() => setRejectId(null)}>
          <div className="approvals-modal" onClick={e => e.stopPropagation()}>
            <h3>Reject Change</h3>
            <p>Provide a reason so the worker understands why this was rejected (optional).</p>
            <textarea
              className="approvals-reason"
              placeholder="e.g. Wrong price entered, check again"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className="approvals-modal-btns">
              <button className="btn-ghost" onClick={() => setRejectId(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleRejectSubmit}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ change, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);

  const actionColor = ACTION_COLORS[change.action] || 'grey';
  const actionLabel = ACTION_LABELS[change.action] || change.action;
  const EntityIcon  = change.entity_type === 'product' ? HiOutlineCube : HiOutlineUsers;

  const formattedDate = new Date(change.created_at).toLocaleString('en-GH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const isPending  = change.status === 'pending';
  const isApproved = change.status === 'approved';

  return (
    <div className={`approval-card ${change.status}`}>
      {/* Card header row — click anywhere to expand/collapse */}
      <div className="ac-top" onClick={() => setExpanded(v => !v)}>
        <div className={`ac-action-badge action-${actionColor}`}>{actionLabel}</div>
        <div className="ac-entity">
          <EntityIcon className="ac-entity-icon" />
          <span className="ac-entity-type">{change.entity_type}</span>
        </div>
        <div className="ac-name">{change.entity_name || '—'}</div>
        <div className="ac-worker">by <strong>{change.worker_name || 'Worker'}</strong></div>
        <div className="ac-date">{formattedDate}</div>

        {isPending && (
          <div className="ac-actions" onClick={e => e.stopPropagation()}>
            <button
              className="ac-btn ac-approve"
              title="Approve"
              onClick={() => onApprove(change.id)}
            >
              <HiOutlineCheckCircle size={20} /> Approve
            </button>
            <button
              className="ac-btn ac-reject"
              title="Reject"
              onClick={() => onReject(change.id)}
            >
              <HiOutlineXCircle size={20} /> Reject
            </button>
          </div>
        )}

        {isApproved && (
          <div className="ac-status-tag approved">
            <HiOutlineCheckCircle size={15} /> Approved
          </div>
        )}

        {change.status === 'rejected' && (
          <div className="ac-status-tag rejected">
            <HiOutlineXCircle size={15} /> Rejected
          </div>
        )}

        <span className="ac-expand">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Rejection reason */}
      {change.status === 'rejected' && change.rejection_reason && (
        <div className="ac-rejection-reason">
          <strong>Reason:</strong> {change.rejection_reason}
        </div>
      )}

      {/* Payload detail */}
      {expanded && (
        <PayloadTable
          payload={change.payload}
          action={change.action}
          entityType={change.entity_type}
          entityName={change.entity_name}
        />
      )}
    </div>
  );
}
