import React, { useState, useEffect, useCallback } from 'react';
import { productsAPI, pendingAPI } from '../../services/api';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { formatMoney, getCurrencyCode, shortDate } from '../../utils/helpers';
import Modal from '../../components/Modal';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCube,
  HiOutlineExclamation,
  HiOutlineClipboardList,
} from 'react-icons/hi';
import toast from '../../utils/notify';

export default function ProductsPage() {
  const { currency } = useCurrency();
  const [products, setProducts] = useState([]);
  const [pendingRows, setPendingRows] = useState([]);
  const { activeLocationId } = useActiveLocation();
  const { user } = useAuth();
  const isWorker = user?.role === 'worker';
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [showStockModal, setShowStockModal] = useState(null);
  const money = formatMoney;

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? { search } : {};
      if (activeLocationId) params.locationId = activeLocationId;
      const { data } = await productsAPI.getAll(params);
      setProducts(data.products || []);

      // Workers: also fetch their own pending submissions so they show in the list
      if (isWorker) {
        try {
          const { data: pd } = await pendingAPI.mine({ entityType: 'product' });
          // convert pending_changes rows into product-shaped objects
          const rows = (pd.changes || []).map(c => ({
            _pendingId:     c.id,
            _pendingAction: c.action,
            _pendingStatus: c.status,
            _submittedAt:   c.created_at,
            id:             c.entity_id || `pending-${c.id}`,
            name:           c.payload?.name || c.entity_name || '(pending)',
            cost_price:     c.payload?.cost_price ?? 0,
            selling_price:  c.payload?.selling_price ?? 0,
            quantity:       c.payload?.quantity ?? 0,
            low_stock_alert: c.payload?.low_stock_alert ?? 0,
            added_at:       c.created_at,
          }));
          setPendingRows(rows);
        } catch {
          setPendingRows([]);
        }
      } else {
        setPendingRows([]);
      }
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [search, activeLocationId, isWorker]);

  useEffect(() => {
    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const handleDelete = async (id, name) => {
    const confirmMsg = isWorker
      ? `Request owner to delete "${name}"?\nThe product will only be removed once approved.`
      : `Delete "${name}"? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await productsAPI.delete(id);
      if (res.data?.pending) {
        window.dispatchEvent(new Event('sikabuk:pendingChanged'));
        toast.success(res.data.message || 'Delete request submitted for owner approval');
      } else {
        toast.success('Product deleted');
        loadProducts();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const openEdit = (product) => {
    setEditProduct(product);
    setShowModal(true);
  };

  const openCreate = () => {
    setEditProduct(null);
    setShowModal(true);
  };


  // Excel upload state
  const [uploading, setUploading] = useState(false);
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      e.target.value = '';
      return;
    }
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await productsAPI.uploadExcel(formData);
      const inserted = res.data.inserted ?? 0;
      const failed = res.data.failed ?? 0;
      const total = inserted + failed;
      
      if (failed > 0) {
        const errors = (res.data.results || [])
          .filter((r) => !r.success)
          .slice(0, 3)
          .map((r) => `Row ${r.rowNumber || '?'}: ${r.error || 'failed'}`)
          .join('; ');
        toast.error(`Imported ${inserted}/${total} products. Failed: ${errors}`, { duration: 6000 });
      } else if (inserted > 0) {
        toast.success(`✓ Successfully imported ${inserted} products`);
      } else {
        toast.error('No products found in file. Check that it has data rows.');
      }
      loadProducts();
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.error || 'Import failed. Check file format.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="products-page" data-currency={currency}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Products</h1>
            <p>{(products.length + pendingRows.length) === 1 ? '1 item in inventory' : `${products.length + pendingRows.length} items in inventory`}{pendingRows.length > 0 ? ` (${pendingRows.length} pending approval)` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" onClick={openCreate}>
              <HiOutlinePlus /> Add Product
            </button>
            <label className="btn btn-outline" style={{ margin: 0, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading...' : 'Upload Excel'}
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar" style={{ marginBottom: 20 }}>
        <HiOutlineSearch className="search-icon" />
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : products.length === 0 && pendingRows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><HiOutlineCube /></div>
            <h3>No products yet</h3>
            <p>Add your first product to start tracking inventory</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
              <HiOutlinePlus /> Add Product
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th className="text-right">Cost Price</th>
                <th className="text-right">Selling Price</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Stock</th>
                <th>Added</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const margin = p.selling_price > 0
                  ? (((p.selling_price - p.cost_price) / p.selling_price) * 100).toFixed(1)
                  : 0;
                const isLow = p.quantity <= (p.low_stock_alert || 10);
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                    </td>
                    <td className="text-right currency">{money(p.cost_price)}</td>
                    <td className="text-right currency">{money(p.selling_price)}</td>
                    <td className="text-right">
                      <span className={Number(margin) > 0 ? 'text-success' : 'text-danger'}>
                        {margin}%
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowStockModal(p)}
                        title="Adjust stock"
                        style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {p.quantity}
                      </button>
                    </td>
                    <td>
                      {shortDate(p.added_at || p.created_at)}
                    </td>
                    <td>
                      {isLow ? (
                        <span className="badge badge-warning">
                          <HiOutlineExclamation style={{ marginRight: 3 }} /> Low
                        </span>
                      ) : (
                        <span className="badge badge-success">In Stock</span>
                      )}
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="edit" onClick={() => openEdit(p)} title="Edit">
                          <HiOutlinePencil />
                        </button>
                        {isWorker ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#b2bec3', fontSize: '1rem' }}
                            onClick={() => handleDelete(p.id, p.name)}
                            title="Request deletion (requires owner approval)"
                          >
                            <HiOutlineClipboardList />
                          </button>
                        ) : (
                          <button className="delete" onClick={() => handleDelete(p.id, p.name)} title="Delete">
                            <HiOutlineTrash />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Worker's own pending submissions shown at the bottom with a Pending badge */}
              {pendingRows.map((p) => (
                <tr key={p._pendingId} style={{ opacity: 0.75, background: 'var(--warning-light, #fffbeb)' }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {p.name}
                      <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: '0.7rem' }}>
                        {p._pendingAction === 'create' ? 'New — ' : 'Edit — '}Awaiting Approval
                      </span>
                    </div>
                  </td>
                  <td className="text-right currency">{money(p.cost_price)}</td>
                  <td className="text-right currency">{money(p.selling_price)}</td>
                  <td className="text-right">
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  </td>
                  <td className="text-right">{p.quantity}</td>
                  <td>{shortDate(p._submittedAt)}</td>
                  <td>
                    <span className="badge badge-warning">Pending</span>
                  </td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <ProductFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        product={editProduct}
        onSaved={loadProducts}
        activeLocationId={activeLocationId}
      />

      {/* Stock Adjust Modal */}
      <StockModal
        product={showStockModal}
        onClose={() => setShowStockModal(null)}
        onSaved={loadProducts}
      />
    </div>
  );
}

/* ── Quantity input parser ───────────────────── */
// Accepts:  196+10  →  206 (inline expression)
//           +10     →  currentStock + 10 (relative)
//           -5      →  currentStock - 5  (relative)
//           200     →  200 (absolute)
function resolveQtyInput(raw, currentStock) {
  const s = raw.trim();
  const expr = s.match(/^(\d+)\s*([+-])\s*(\d+)$/);
  if (expr) {
    const a = parseInt(expr[1], 10);
    const b = parseInt(expr[3], 10);
    return { result: Math.max(0, expr[2] === '+' ? a + b : a - b), type: 'expr', a, b, op: expr[2] };
  }
  if (/^[+-]\d+$/.test(s)) {
    const delta = parseInt(s, 10);
    return { result: Math.max(0, (currentStock || 0) + delta), type: 'relative', delta };
  }
  const n = parseInt(s, 10);
  return { result: Math.max(0, isNaN(n) ? 0 : n), type: 'absolute' };
}

/* ── Product Form Modal ─────────────────────── */
function ProductFormModal({ isOpen, onClose, product, onSaved, activeLocationId }) {
  const [form, setForm] = useState({ name: '', cost_price: '', selling_price: '', quantity: '', low_stock_alert: '10' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        cost_price: product.cost_price?.toString() || '',
        selling_price: product.selling_price?.toString() || '',
        quantity: product.quantity?.toString() || '',
        low_stock_alert: product.low_stock_alert?.toString() || '10',
      });
    } else {
      setForm({ name: '', cost_price: '', selling_price: '', quantity: '', low_stock_alert: '10' });
    }
  }, [product, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Enter product name');
    if (!form.cost_price) return toast.error('Enter cost price');
    if (!form.selling_price) return toast.error('Enter selling price');

    // Parse quantity — supports 196+10, +10, -5, or plain 200
    const { result: resolvedQty } = resolveQtyInput(form.quantity || '0', product?.quantity || 0);

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        cost_price: parseFloat(form.cost_price),
        selling_price: parseFloat(form.selling_price),
        quantity: resolvedQty,
        low_stock_alert: parseInt(form.low_stock_alert) || 10,
      };

          // Attach the active shop location when creating a product
          if (!product && activeLocationId) {
            payload.location_id = activeLocationId;
          }

      if (product) {
        const res = await productsAPI.update(product.id, payload);
        if (res.data?.pending) {
          window.dispatchEvent(new Event('sikabuk:pendingChanged'));
          toast.success(res.data.message || 'Update submitted for owner approval');
          onSaved(); // reload so the pending row appears in the list
        } else {
          toast.success('Product updated');
          onSaved();
        }
      } else {
        const res = await productsAPI.create(payload);
        if (res.data?.pending) {
          window.dispatchEvent(new Event('sikabuk:pendingChanged'));
          toast.success(res.data.message || 'New product submitted for owner approval');
          onSaved(); // reload so the pending row appears in the list
        } else {
          toast.success('Product added');
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
      title={product ? 'Edit Product' : 'Add New Product'}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : product ? 'Update' : 'Add Product'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Product Name</label>
          <input
            className="form-input"
            placeholder="e.g. Rice Bag 25kg"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Cost Price ({getCurrencyCode()})</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Selling Price ({getCurrencyCode()})</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{product ? 'Stock  (+10, -5, or 190+10)' : 'Initial Stock'}</label>
            <input
              className="form-input"
              type="text"
              inputMode="numeric"
              placeholder={product ? `Current: ${product.quantity ?? 0}` : '0'}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            {product && form.quantity.trim() && (() => {
              const parsed = resolveQtyInput(form.quantity, product.quantity || 0);
              if (parsed.type === 'absolute' && isNaN(parseInt(form.quantity.trim(), 10))) return null;
              const { result, type, a, b, op, delta } = parsed;
              let label;
              if (type === 'expr')  label = `${a} ${op} ${b} = `;
              else if (type === 'relative') label = `${product.quantity} ${delta >= 0 ? '+' : ''}${delta} = `;
              else label = 'New stock: ';
              return (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 5 }}>
                  {label}
                  <strong style={{ color: result <= (product.low_stock_alert || 10) ? '#e17055' : '#00b894' }}>
                    {result} units
                  </strong>
                </p>
              );
            })()}
          </div>
          <div className="form-group">
            <label>Low Stock Alert</label>
            <input
              className="form-input"
              type="number"
              min="0"
              placeholder="10"
              value={form.low_stock_alert}
              onChange={(e) => setForm({ ...form, low_stock_alert: e.target.value })}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ── Stock Adjustment Modal ─────────────────── */
function StockModal({ product, onClose, onSaved }) {
  const [change, setChange] = useState('');
  const [saving, setSaving] = useState(false);

  if (!product) return null;

  const handleSubmit = async () => {
    const val = parseInt(change);
    if (!val || val === 0) return toast.error('Enter a stock change amount');
    setSaving(true);
    try {
      const res = await productsAPI.adjustQty(product.id, val);
      if (res.data?.pending) {
        window.dispatchEvent(new Event('sikabuk:pendingChanged'));
        toast.success(res.data.message || 'Stock adjustment submitted for owner approval');
      } else {
        toast.success(`Stock ${val > 0 ? 'added' : 'removed'} successfully`);
        onSaved();
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Adjust Stock: ${product.name}`}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Update Stock'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
        Current stock: <strong>{product.quantity} {product.quantity === 1 ? 'unit' : 'units'}</strong>
      </p>
      <div className="form-group">
        <label>Quantity to Add or Remove</label>
        <input
          className="form-input"
          type="number"
          placeholder="e.g. +50 to add, -10 to remove"
          value={change}
          onChange={(e) => setChange(e.target.value)}
          autoFocus
        />
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
          Enter a positive number to add stock or a negative number to deduct it.
        </p>
      </div>
      {change && (
        <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
          Stock after update: <span className="text-success">{Math.max(0, product.quantity + (parseInt(change) || 0))}</span>
        </p>
      )}
    </Modal>
  );
}
