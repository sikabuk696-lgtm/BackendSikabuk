import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { locationsAPI } from '../../services/api';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import Modal from '../../components/Modal';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';
import toast from '../../utils/notify';
import './ShopsPage.css';

export default function ShopsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await locationsAPI.getAll();
      setLocations(data.locations || []);
    } catch (err) {
      toast.error('Failed to load shops');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete shop "${loc.name}"? This will not delete sales history.`)) return;
    try {
      await locationsAPI.delete(loc.id);
      toast.success('Shop removed');
      load();
      // notify header/context to refresh the locations list immediately, include removed id
      window.dispatchEvent(new CustomEvent('sikabuk:locationsChanged', { detail: { removed: loc.id } }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="shops-page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Shops</h1>
            <p>Manage your business locations</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            <HiOutlinePlus /> Add Shop
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : locations.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🏬</div>
            <h3>No shops yet</h3>
            <p>Create a location for each of your physical stores</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => { setEditing(null); setShowModal(true); }}>
              <HiOutlinePlus /> Add Shop
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Timezone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{l.address || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{l.phone || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{l.timezone || '—'}</td>
                  <td>
                    <div className="action-btns">
                      <button className="edit" onClick={() => { setEditing(l); setShowModal(true); }} title="Edit shop"><HiOutlinePencil /></button>
                      <button className="delete" onClick={() => handleDelete(l)} title="Delete shop"><HiOutlineTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ShopFormModal isOpen={showModal} onClose={() => setShowModal(false)} shop={editing} onSaved={load} />
    </div>
  );
}

function ShopFormModal({ isOpen, onClose, shop, onSaved }) {
  const { setActive } = useActiveLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', address: '', phone: '', timezone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (shop) setForm({ name: shop.name || '', address: shop.address || '', phone: shop.phone || '', timezone: shop.timezone || '' });
      else setForm({ name: '', address: '', phone: '', timezone: '' });
    }
  }, [isOpen, shop]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || form.name.trim().length < 2) return toast.error('Name is required');
    setSaving(true);
    try {
      if (shop) {
        await locationsAPI.update(shop.id, form);
        toast.success('Updated');
        onSaved();
      } else {
        const res = await locationsAPI.create(form);
        const newLoc = res.data.location;
        toast.success('Created');

        // optimistically add new location then navigate
        window.dispatchEvent(new CustomEvent('sikabuk:locationsChanged', { detail: { added: newLoc } }));
        // make the new shop active immediately
        setActive(newLoc.id);
        navigate('/dashboard');
        onSaved();
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={shop ? 'Edit Shop' : 'Add Shop'}
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : (shop ? 'Update' : 'Create')}</button>
        </>
      )}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Shop name</label>
          <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="form-group">
          <label>Address (optional)</label>
          <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="form-group" style={{ width: 220 }}>
            <label>Phone (optional)</label>
            <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-group" style={{ width: 220 }}>
            <label>Timezone (optional)</label>
            <input className="form-input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="e.g. Africa/Accra" />
          </div>
        </div>
      </form>
    </Modal>
  );
}
