import React, { useState, useEffect, useCallback } from 'react';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { expensesAPI } from '../../services/api';
import { formatMoney, getCurrencyCode, shortDate, todayISO, monthStartISO } from '../../utils/helpers';
import Modal from '../../components/Modal';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCash,
} from 'react-icons/hi';
import toast from '../../utils/notify';

const CATEGORIES = [
  'Rent', 'Utilities', 'Transport', 'Supplies', 'Wages',
  'Food', 'Airtime', 'Maintenance', 'Taxes', 'Other'
];

export default function ExpensesPage() {
  const { currency } = useCurrency();
  const [expenses, setExpenses] = useState([]);
  const { activeLocationId } = useActiveLocation();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ startDate: monthStartISO(), endDate: todayISO() });
  const [totalAmount, setTotalAmount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editExpense, setEditExpense] = useState(null);


  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };
      if (activeLocationId) params.locationId = activeLocationId;
      const { data } = await expensesAPI.getAll(params);
      setExpenses(data.expenses || []);
      setTotalAmount(data.totalAmount || 0);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [dateRange, activeLocationId]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleDelete = async (id, desc) => {
    if (!window.confirm(`Delete "${desc}"?`)) return;
    try {
      await expensesAPI.delete(id);
      toast.success('Expense deleted');
      loadExpenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const filteredExpenses = search
    ? expenses.filter((e) =>
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase())
      )
    : expenses;

  return (
    <div className="expenses-page" data-currency={currency}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Expenses</h1>
            <p>
              {filteredExpenses.length} records &middot;
              Total: <strong className="currency text-danger">{formatMoney(totalAmount)}</strong>
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditExpense(null); setShowModal(true); }}>
            <HiOutlinePlus /> Add Expense
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar">
          <HiOutlineSearch className="search-icon" />
          <input placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '8px 12px', fontSize: '0.85rem' }}
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '8px 12px', fontSize: '0.85rem' }}
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : filteredExpenses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><HiOutlineCash /></div>
            <h3>No expenses recorded</h3>
            <p>Track your business expenses to understand your costs</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => { setEditExpense(null); setShowModal(true); }}>
              <HiOutlinePlus /> Add Expense
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{shortDate(exp.expense_date)}</td>
                  <td style={{ fontWeight: 600 }}>{exp.description}</td>
                  <td>
                    <span className="badge badge-neutral">{exp.category}</span>
                  </td>
                  <td className="text-right currency fw-600 text-danger">{formatMoney(exp.amount)}</td>
                  <td>
                    <div className="action-btns">
                      <button className="edit" onClick={() => { setEditExpense(exp); setShowModal(true); }} title="Edit">
                        <HiOutlinePencil />
                      </button>
                      <button className="delete" onClick={() => handleDelete(exp.id, exp.description)} title="Delete">
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

      <ExpenseFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        expense={editExpense}
        onSaved={loadExpenses}
      />
    </div>
  );
}

/* ── Expense Form Modal ─────────────────────── */
function ExpenseFormModal({ isOpen, onClose, expense, onSaved }) {
  const { activeLocationId } = useActiveLocation();
  const [form, setForm] = useState({
    description: '', amount: '', category: '', expense_date: todayISO(), location_id: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setForm({
        description: expense.description || '',
        amount: expense.amount?.toString() || '',
        category: expense.category || '',
        expense_date: expense.expense_date || todayISO(),
        location_id: expense.location_id || ''
      });
    } else {
      setForm({ description: '', amount: '', category: '', expense_date: todayISO(), location_id: '' });
    }
  }, [expense, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error('Enter a description');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (!form.category) return toast.error('Select a category');

    setSaving(true);
    try {
      const payload = {
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        category: form.category,
        expense_date: form.expense_date,
        location_id: activeLocationId || null
      };

      if (expense) {
        await expensesAPI.update(expense.id, payload);
        toast.success('Expense updated');
      } else {
        await expensesAPI.create(payload);
        toast.success('Expense recorded');
      }
      onSaved();
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
      title={expense ? 'Edit Expense' : 'Add New Expense'}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Description</label>
          <input
            className="form-input"
            placeholder="e.g. Electricity Bill"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            autoFocus
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Amount ({getCurrencyCode()})</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              className="form-select"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Date</label>
          <input
            className="form-input"
            type="date"
            value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
          />
        </div>
      </form>
    </Modal>
  );
}
