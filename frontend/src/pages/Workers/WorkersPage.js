import React, { useState, useEffect, useCallback } from 'react';
import { workersAPI } from '../../services/api';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { relativeTime } from '../../utils/helpers';
import Modal from '../../components/Modal';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineUserGroup,
  HiOutlineBan,
  HiOutlineRefresh,
  HiOutlineClipboardCopy,
  HiOutlineCheck,
  HiOutlineX,
} from 'react-icons/hi';
import toast from '../../utils/notify';

const ROLE_OPTIONS = [
  { value: 'worker',        label: 'Worker',        desc: 'General employee — sales & stock via approval queue' },
  { value: 'cashier',       label: 'Cashier',       desc: 'Focuses on recording sales & managing customers' },
  { value: 'stock_manager', label: 'Stock Manager', desc: 'Manages products & stock adjustments via approval queue' },
  { value: 'manager',       label: 'Manager',       desc: 'Branch manager — can also manage expenses' },
  { value: 'accountant',    label: 'Accountant',    desc: 'Finance role — can view & record expenses' },
  { value: 'cofounder',     label: 'Co-founder',    desc: 'Full owner access — logs in with Google. Email required.' },
];

const ROLE_BADGE_CLASS = {
  owner:         'badge-warning',
  cofounder:     'badge-warning',
  manager:       'badge-primary',
  accountant:    'badge-primary',
  cashier:       'badge-info',
  stock_manager: 'badge-info',
  worker:        'badge-info',
};

const ROLE_LABELS = {
  owner:         'Owner',
  cofounder:     'Co-founder',
  manager:       'Manager',
  accountant:    'Accountant',
  cashier:       'Cashier',
  stock_manager: 'Stock Mgr',
  worker:        'Worker',
};

export default function WorkersPage() {
  const { user } = useAuth();
  const { activeLocationId } = useActiveLocation();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editWorker, setEditWorker] = useState(null);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeLocationId) params.locationId = activeLocationId;
      const { data } = await workersAPI.getAll(params);
      setWorkers(data.data || []);
    } catch (err) {
      toast.error('Failed to load workers');
    } finally {
      setLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Deactivate worker "${name}"? They will no longer be able to log in.`)) return;
    try {
      await workersAPI.delete(id);
      toast.success('Worker deactivated');
      loadWorkers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleReactivate = async (id) => {
    try {
      await workersAPI.reactivate(id);
      toast.success('Worker reactivated');
      loadWorkers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleSavePhone = async () => {
    if (!whatsAppPhone.trim()) return setEditingPhone(false);
    setSavingPhone(true);
    try {
      await authAPI.updatePhone(whatsAppPhone.trim());
      toast.success('WhatsApp number saved');
      setEditingPhone(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save number');
    } finally {
      setSavingPhone(false);
    }
  };

  const copyBusinessId = () => {
    if (user?.shortCode) {
      navigator.clipboard.writeText(user.shortCode);
      toast.success('Business Code copied! Share with your workers for login.');
    }
  };

  const { locations } = useActiveLocation();

  return (
    <div className="workers-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Workers</h1>
            <p>{workers.filter((w) => w.role !== 'owner').length} team members{activeLocationId ? ' (filtered)' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={copyBusinessId} title="Copy business code for workers">
              <HiOutlineClipboardCopy /> Copy Business Code
            </button>
            <button className="btn btn-primary" onClick={() => { setEditWorker(null); setShowModal(true); }}>
              <HiOutlinePlus /> Add Worker
            </button>
          </div>
        </div>
      </div>

      {/* Business Code callout */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Workers use this Business Code to log in:
          </span>
          <code style={{
            background: 'var(--bg)',
            padding: '5px 12px',
            borderRadius: 6,
            fontSize: '1.1rem',
            fontFamily: "'SF Mono', monospace",
            color: 'var(--secondary)',
            fontWeight: 700,
            letterSpacing: '3px',
            border: '1px solid var(--border)',
            userSelect: 'all',
          }}>
            {user?.shortCode || '—'}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={copyBusinessId}>
            <HiOutlineClipboardCopy /> Copy
          </button>
        </div>

        {/* WhatsApp number for owner notifications */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Your WhatsApp (for approval alerts):
          </span>
          {editingPhone ? (
            <>
              <input
                className="form-input"
                style={{ maxWidth: 180, padding: '4px 10px', fontSize: '0.9rem' }}
                placeholder="e.g. 0201234567"
                value={whatsAppPhone}
                onChange={(e) => setWhatsAppPhone(e.target.value)}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={handleSavePhone} disabled={savingPhone}>
                <HiOutlineCheck /> {savingPhone ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingPhone(false)}>
                <HiOutlineX /> Cancel
              </button>
            </>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setWhatsAppPhone(''); setEditingPhone(true); }}
              style={{ color: 'var(--secondary)', fontSize: '0.82rem' }}
            >
              <HiOutlinePencil /> {whatsAppPhone ? whatsAppPhone : 'Add number'}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : workers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><HiOutlineUserGroup /></div>
            <h3>No workers yet</h3>
            <p>Add workers so they can help manage your store</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => { setEditWorker(null); setShowModal(true); }}>
              <HiOutlinePlus /> Add Worker
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Shop</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: w.role === 'owner' ? 'var(--primary-bg)' : 'var(--info-light)',
                        color: w.role === 'owner' ? 'var(--primary-dark)' : 'var(--info)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                      }}>
                        {(w.worker_name || 'W').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600 }}>{w.worker_name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    {locations.find(l => l.id === w.location_id)?.name || <span style={{ color: 'var(--text-muted)' }}>All Shops</span>}
                  </td>
                  <td>
                    <span className={`badge ${ROLE_BADGE_CLASS[w.role] || 'badge-info'}`}>
                      {ROLE_LABELS[w.role] || w.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${w.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    {relativeTime(w.last_login_at)}
                  </td>
                  <td>
                    {w.role !== 'owner' && (
                      <div className="action-btns">
                        <button className="edit" onClick={() => { setEditWorker(w); setShowModal(true); }} title="Edit">
                          <HiOutlinePencil />
                        </button>
                        {w.is_active ? (
                          <button className="delete" onClick={() => handleDeactivate(w.id, w.worker_name)} title="Deactivate">
                            <HiOutlineBan />
                          </button>
                        ) : (
                          <button
                            className="edit"
                            onClick={() => handleReactivate(w.id)}
                            title="Reactivate"
                            style={{ color: 'var(--accent)' }}
                          >
                            <HiOutlineRefresh />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WorkerFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        worker={editWorker}
        onSaved={loadWorkers}
        locations={locations}
        activeLocationId={activeLocationId}
      />
    </div>
  );
}

/* ── Worker Form Modal ──────────────────────── */
function WorkerFormModal({ isOpen, onClose, worker, onSaved, locations = [], activeLocationId = '' }) {
  const [form, setForm] = useState({ worker_name: '', pin: '', location_id: '', role: 'worker', email: '' });
  const [saving, setSaving] = useState(false);
  const isCofounder = form.role === 'cofounder';

  useEffect(() => {
    if (worker) {
      setForm({
        worker_name: worker.worker_name || '',
        pin:         '',
        location_id: worker.location_id || '',
        role:        worker.role || 'worker',
        email:       worker.email || '',
      });
    } else {
      setForm({ worker_name: '', pin: '', location_id: activeLocationId || '', role: 'worker', email: '' });
    }
  }, [worker, isOpen, activeLocationId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.worker_name.trim() || form.worker_name.trim().length < 2) {
      return toast.error('Name must be at least 2 characters');
    }

    if (form.role === 'cofounder') {
      if (!form.email.trim() || !form.email.includes('@')) {
        return toast.error('A valid email address is required for co-founders');
      }
    } else {
      if (!worker && (!form.pin || form.pin.length !== 4)) {
        return toast.error('PIN must be exactly 4 digits');
      }
      if (form.pin && form.pin.length !== 4) {
        return toast.error('PIN must be exactly 4 digits');
      }
    }

    setSaving(true);
    try {
      const payload = {
        worker_name: form.worker_name.trim(),
        location_id: form.location_id || null,
        role:        form.role,
      };
      if (form.role === 'cofounder') {
        payload.email = form.email.toLowerCase().trim();
      } else if (form.pin) {
        payload.pin = form.pin;
      }

      if (worker) {
        await workersAPI.update(worker.id, payload);
        toast.success('Worker updated');
      } else {
        await workersAPI.create(payload);
        toast.success(form.role === 'cofounder' ? 'Co-founder added — they can now log in with Google' : 'Worker added');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === form.role);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={worker ? 'Edit Worker' : 'Add Team Member'}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : worker ? 'Update' : 'Add'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* Role selector */}
        <div className="form-group">
          <label>Role</label>
          <select
            className="form-select"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            disabled={!!worker} // can't change role of existing worker here
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {selectedRole && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {selectedRole.desc}
            </p>
          )}
        </div>

        <div className="form-group">
          <label>Full Name</label>
          <input
            className="form-input"
            placeholder="e.g. Yaw Addo"
            value={form.worker_name}
            onChange={(e) => setForm({ ...form, worker_name: e.target.value })}
            autoFocus
          />
        </div>

        {/* Email — shown for co-founders only */}
        {isCofounder && (
          <div className="form-group">
            <label>Google Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="e.g. kwame@gmail.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Co-founders log in with this Google account — no PIN needed at setup
            </p>
          </div>
        )}

        {/* PIN — hidden for co-founders */}
        {!isCofounder && (
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>{worker ? 'New PIN (leave blank to keep current)' : '4-Digit PIN'}</label>
              <input
                className="form-input"
                type="password"
                maxLength={4}
                placeholder="e.g. 1234"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                style={{ letterSpacing: '0.3em', fontWeight: 600 }}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Workers use this PIN to log into the app
              </p>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Assign to Shop</label>
          <select
            className="form-select"
            value={form.location_id || ''}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
          >
            <option value="">No specific shop (All Shops)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Workers can only view data for their assigned shop
          </p>
        </div>
      </form>
    </Modal>
  );
}
