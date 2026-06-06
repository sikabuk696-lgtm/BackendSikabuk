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
  HiOutlinePaperClip,
  HiOutlineExternalLink,
  HiOutlineDownload,
  HiOutlineEye,
  HiOutlineX,
} from 'react-icons/hi';
import toast from '../../utils/notify';

const CATEGORIES = [
  'Rent', 'Utilities', 'Transport', 'Supplies', 'Wages',
  'Food', 'Airtime', 'Maintenance', 'Taxes', 'Bank Transfer', 'Other'
];

const ACCEPTED_ATTACHMENT_TYPES = '.jpg,.jpeg,.png,.webp,.pdf';
const REQUIRED_PROOF_CATEGORIES = ['Bank Transfer'];

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!size || Number.isNaN(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [viewExpense, setViewExpense] = useState(null);


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

  const openExpenseDetails = async (expenseId) => {
    try {
      const { data } = await expensesAPI.getOne(expenseId);
      setViewExpense(data.expense);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load expense');
    }
  };

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

  const handleDownloadAttachment = async (expense) => {
    try {
      const response = await expensesAPI.downloadAttachment(expense.id);
      const fileType = response.headers['content-type'] || expense?.attachment?.fileType || 'application/octet-stream';
      const fileName = expense?.attachment?.fileName || `expense-proof-${expense.id}`;
      const blob = new Blob([response.data], { type: fileType });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to download proof');
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
                <th>Recorded By</th>
                <th className="text-right">Amount</th>
                <th>Proof</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="expense-row" onClick={() => openExpenseDetails(exp.id)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{shortDate(exp.expense_date)}</td>
                  <td style={{ fontWeight: 600 }}>
                    <button
                      type="button"
                      className="expense-link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openExpenseDetails(exp.id);
                      }}
                    >
                      {exp.description}
                    </button>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{exp.category}</span>
                  </td>
                  <td>{exp.recorder?.worker_name || 'Unknown'}</td>
                  <td className="text-right currency fw-600 text-danger">{formatMoney(exp.amount)}</td>
                  <td>
                    {exp.attachment?.url ? (
                      <a
                        href={exp.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="expense-proof-link"
                        title={exp.attachment.fileName || 'View proof'}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <HiOutlinePaperClip />
                        <span>Proof</span>
                        <HiOutlineExternalLink />
                      </a>
                    ) : null}
                  </td>
                  <td>
                    <div className="action-btns" onClick={(e) => e.stopPropagation()}>
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

      <ExpenseDetailsModal
        expense={viewExpense}
        onClose={() => setViewExpense(null)}
        onEdit={(expense) => {
          setViewExpense(null);
          setEditExpense(expense);
          setShowModal(true);
        }}
        onDownloadAttachment={handleDownloadAttachment}
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
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [removeCurrentAttachment, setRemoveCurrentAttachment] = useState(false);
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
    setAttachmentFile(null);
    setRemoveCurrentAttachment(false);
  }, [expense, isOpen]);

  const requiresProof = REQUIRED_PROOF_CATEGORIES.includes(form.category);

  const handleAttachmentChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setAttachmentFile(null);
      return;
    }

    const isAllowedType = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type);
    if (!isAllowedType) {
      e.target.value = '';
      toast.error('Only JPG, PNG, WEBP, or PDF files are allowed');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      e.target.value = '';
      toast.error('Attachment must be 10MB or smaller');
      return;
    }

    setAttachmentFile(file);
    setRemoveCurrentAttachment(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error('Enter a description');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (!form.category) return toast.error('Select a category');
    if (requiresProof && !attachmentFile && !expense?.attachment?.url) {
      return toast.error('Bank transfer expenses require a proof attachment');
    }
    if (requiresProof && removeCurrentAttachment && !attachmentFile) {
      return toast.error('Bank transfer expenses require a proof attachment');
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('description', form.description.trim());
      payload.append('amount', parseFloat(form.amount).toString());
      payload.append('category', form.category);
      payload.append('expense_date', form.expense_date);
      payload.append('location_id', activeLocationId || '');
      payload.append('remove_attachment', removeCurrentAttachment ? 'true' : 'false');
      if (attachmentFile) {
        payload.append('attachment', attachmentFile);
      }

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
        <div className="form-group">
          <label>Proof Attachment</label>
          <input
            className="form-input"
            type="file"
            accept={ACCEPTED_ATTACHMENT_TYPES}
            onChange={handleAttachmentChange}
          />
          <small style={{ color: 'var(--text-muted)' }}>
            Upload a bank slip, receipt, or invoice as JPG, PNG, WEBP, or PDF up to 10MB.
            {requiresProof ? ' This category requires proof.' : ''}
          </small>
          {attachmentFile ? (
            <div className="expense-proof-meta">
              Selected: <strong>{attachmentFile.name}</strong>
              {attachmentFile.size ? ` (${formatFileSize(attachmentFile.size)})` : ''}
            </div>
          ) : null}
          {!attachmentFile && expense?.attachment?.url && !removeCurrentAttachment ? (
            <div className="expense-proof-actions">
              <a
                href={expense.attachment.url}
                target="_blank"
                rel="noreferrer"
                className="expense-proof-link expense-proof-link-inline"
              >
                <HiOutlinePaperClip />
                <span>{expense.attachment.fileName || 'View current proof'}</span>
                <HiOutlineExternalLink />
              </a>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setRemoveCurrentAttachment(true)}
              >
                <HiOutlineX /> Remove proof
              </button>
            </div>
          ) : null}
          {removeCurrentAttachment ? (
            <div className="expense-proof-meta text-danger">
              Current proof will be removed when you save.
              <button
                type="button"
                className="expense-inline-action"
                onClick={() => setRemoveCurrentAttachment(false)}
              >
                Undo
              </button>
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function ExpenseDetailsModal({ expense, onClose, onEdit, onDownloadAttachment }) {
  const isOpen = Boolean(expense);
  const isImage = expense?.attachment?.fileType?.startsWith('image/');
  const isPdf = expense?.attachment?.fileType === 'application/pdf';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Expense Details"
      footer={
        expense ? (
          <>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
            {expense.attachment?.url ? (
              <button className="btn btn-outline" onClick={() => onDownloadAttachment(expense)}>
                <HiOutlineDownload /> Download Proof
              </button>
            ) : null}
            <button className="btn btn-primary" onClick={() => onEdit(expense)}>
              <HiOutlinePencil /> Edit Expense
            </button>
          </>
        ) : null
      }
    >
      {expense ? (
        <div className="expense-details">
          <div className="expense-details-grid">
            <div>
              <span className="expense-details-label">Description</span>
              <strong>{expense.description}</strong>
            </div>
            <div>
              <span className="expense-details-label">Category</span>
              <strong>{expense.category}</strong>
            </div>
            <div>
              <span className="expense-details-label">Recorded By</span>
              <strong>{expense.recorder?.worker_name || 'Unknown'}</strong>
            </div>
            <div>
              <span className="expense-details-label">Amount</span>
              <strong className="currency text-danger">{formatMoney(expense.amount)}</strong>
            </div>
            <div>
              <span className="expense-details-label">Date</span>
              <strong>{shortDate(expense.expense_date)}</strong>
            </div>
          </div>

          <div className="expense-details-proof">
            <div className="expense-details-proof-header">
              <span className="expense-details-label">Proof</span>
              {expense.attachment?.url ? (
                <div className="expense-proof-actions">
                  <a href={expense.attachment.url} target="_blank" rel="noreferrer" className="expense-proof-link">
                    <HiOutlineEye />
                    <span>Open full proof</span>
                  </a>
                  <button className="btn btn-outline btn-sm" onClick={() => onDownloadAttachment(expense)}>
                    <HiOutlineDownload /> Download
                  </button>
                </div>
              ) : null}
            </div>

            {!expense.attachment?.url ? (
              <div className="expense-proof-empty">No proof uploaded for this expense.</div>
            ) : isImage ? (
              <img className="expense-proof-preview-image" src={expense.attachment.url} alt={expense.attachment.fileName || 'Expense proof'} />
            ) : isPdf ? (
              <iframe className="expense-proof-preview-frame" src={expense.attachment.url} title={expense.attachment.fileName || 'Expense proof PDF'} />
            ) : (
              <div className="expense-proof-file-card">
                <HiOutlinePaperClip />
                <div>
                  <strong>{expense.attachment.fileName || 'Proof file'}</strong>
                  <div>{formatFileSize(expense.attachment.fileSize)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
