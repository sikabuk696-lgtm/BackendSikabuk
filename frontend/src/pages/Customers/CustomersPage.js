import React, { useState, useEffect, useCallback } from 'react';
import { customersAPI } from '../../services/api';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { formatMoney, getCurrencyCode } from '../../utils/helpers';
import Modal from '../../components/Modal';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineUsers,
  HiOutlineCash,
} from 'react-icons/hi';
import toast from '../../utils/notify';

export default function CustomersPage() {
  const { currency } = useCurrency();
  const [customers, setCustomers] = useState([]);
  const { activeLocationId } = useActiveLocation();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDebtOnly, setShowDebtOnly] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [debtModal, setDebtModal] = useState(null);
  const money = formatMoney;

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      if (showDebtOnly) {
        const params = {};
        if (activeLocationId) params.locationId = activeLocationId;
        res = await customersAPI.getWithDebt(params);
      } else {
        const params = search ? { search } : {};
        if (activeLocationId) params.locationId = activeLocationId;
        res = await customersAPI.getAll(params);
      }
      setCustomers(res.data.customers || []);
    } catch (err) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [search, showDebtOnly, activeLocationId]);

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [loadCustomers]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await customersAPI.delete(id);
      toast.success('Customer deleted');
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const totalDebt = customers.reduce((sum, c) => sum + (Number(c.total_debt) || 0), 0);

  return (
    <div className="customers-page" data-currency={currency}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Customers</h1>
            <p>
              {customers.length === 1 ? '1 customer' : `${customers.length} customers`}
              {totalDebt > 0 && <> &middot; Outstanding debt: <strong className="text-danger currency">{money(totalDebt)}</strong></>}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditCustomer(null); setShowModal(true); }}>
            <HiOutlinePlus /> Add Customer
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar">
          <HiOutlineSearch className="search-icon" />
          <input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          className={`btn btn-sm ${showDebtOnly ? 'btn-danger' : 'btn-outline'}`}
          onClick={() => setShowDebtOnly(!showDebtOnly)}
        >
          <HiOutlineCash /> {showDebtOnly ? 'Showing Debtors' : 'Show Debtors'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : customers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><HiOutlineUsers /></div>
            <h3>No customers yet</h3>
            <p>Add customers to track sales and debt</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => { setEditCustomer(null); setShowModal(true); }}>
              <HiOutlinePlus /> Add Customer
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Phone</th>
                <th className="text-right">Debt</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.phone || '—'}</td>
                  <td className="text-right currency fw-600">
                    <span className={Number(c.total_debt) > 0 ? 'text-danger' : ''}>
                      {money(c.total_debt)}
                    </span>
                  </td>
                  <td>
                    {Number(c.total_debt) > 0 ? (
                      <span className="badge badge-danger">Owing</span>
                    ) : (
                      <span className="badge badge-success">Clear</span>
                    )}
                  </td>
                  <td>
                    <div className="action-btns">
                      {Number(c.total_debt) > 0 && (
                        <button
                          className="edit"
                          onClick={() => setDebtModal(c)}
                          title="Record Payment"
                          style={{ color: 'var(--accent)' }}
                        >
                          <HiOutlineCash />
                        </button>
                      )}
                      <button className="edit" onClick={() => { setEditCustomer(c); setShowModal(true); }} title="Edit">
                        <HiOutlinePencil />
                      </button>
                      <button className="delete" onClick={() => handleDelete(c.id, c.name)} title="Delete">
                        <HiOutlineTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        customer={editCustomer}
        onSaved={loadCustomers}
      />

      <DebtPaymentModal
        customer={debtModal}
        onClose={() => setDebtModal(null)}
        onSaved={loadCustomers}
      />
    </div>
  );
}

/* ── Customer Form Modal ────────────────────── */
function CustomerFormModal({ isOpen, onClose, customer, onSaved }) {
  const { activeLocationId } = useActiveLocation();
  const [form, setForm] = useState({ name: '', phone: '', total_debt: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || '',
        phone: customer.phone || '',
        total_debt: customer.total_debt > 0 ? String(customer.total_debt) : '',
      });
    } else {
      setForm({ name: '', phone: '', total_debt: '' });
    }
  }, [customer, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Enter customer name');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        total_debt: form.total_debt !== '' ? parseFloat(form.total_debt) || 0 : 0,
        location_id: activeLocationId || null,
      };
      if (customer) {
        const res = await customersAPI.update(customer.id, payload);
        if (res.data?.pending) {
          window.dispatchEvent(new Event('sikabuk:pendingChanged'));
          toast.success(res.data.message || 'Update submitted for owner approval');
        } else {
          toast.success('Customer updated');
          onSaved();
        }
      } else {
        const res = await customersAPI.create(payload);
        if (res.data?.pending) {
          window.dispatchEvent(new Event('sikabuk:pendingChanged'));
          toast.success(res.data.message || 'Customer submitted for owner approval');
        } else {
          toast.success('Customer added');
          onSaved();
        }
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
      title={customer ? 'Edit Customer' : 'Add New Customer'}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : customer ? 'Update' : 'Add Customer'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Customer Name</label>
          <input
            className="form-input"
            placeholder="e.g. Akosua Mensah"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Phone Number <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <input
            className="form-input"
            placeholder="e.g. 024 123 4567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Outstanding Debt ({getCurrencyCode()}) <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <input
            className="form-input"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.total_debt}
            onChange={(e) => setForm({ ...form, total_debt: e.target.value })}
          />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {customer ? 'Use the payment button on the table to reduce debt.' : 'Enter any existing debt this customer already owes.'}
          </p>
        </div>
      </form>
    </Modal>
  );
}

/* ── Debt Payment Modal ─────────────────────── */
function DebtPaymentModal({ customer, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const money = formatMoney;

  if (!customer) return null;

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return toast.error('Enter a valid payment amount');
    if (val > Number(customer.total_debt)) return toast.error('Amount exceeds total debt');

    setSaving(true);
    try {
      await customersAPI.adjustDebt(customer.id, -val);
      toast.success(`Payment of ${money(val)} recorded`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Record Payment — ${customer.name}`}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
        Current debt: <strong className="text-danger">{money(customer.total_debt)}</strong>
      </p>
      <div className="form-group">
        <label>Payment Amount ({getCurrencyCode()})</label>
        <input
          className="form-input"
          type="number"
          step="0.01"
          min="0"
          max={customer.total_debt}
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={() => setAmount((Number(customer.total_debt) / 2).toFixed(2))}>
          Half
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setAmount(Number(customer.total_debt).toFixed(2))}>
          Full Amount
        </button>
      </div>
      {amount && (
        <p style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: 12 }}>
          Remaining debt: <span className={Number(customer.total_debt) - parseFloat(amount) <= 0 ? 'text-success' : 'text-danger'}>
            {money(Math.max(0, Number(customer.total_debt) - (parseFloat(amount) || 0)))}
          </span>
        </p>
      )}
    </Modal>
  );
}
