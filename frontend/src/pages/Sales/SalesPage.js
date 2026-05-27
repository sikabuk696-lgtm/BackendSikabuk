import React, { useState, useEffect, useCallback } from 'react';
import { salesAPI, productsAPI, customersAPI, locationsAPI } from '../../services/api';
import { formatMoney, getCurrencyCode, shortDate } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useCurrency } from '../../context/CurrencyContext';
import Modal from '../../components/Modal';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineShoppingCart,
  HiOutlineCheckCircle,
  HiOutlineClock,
} from 'react-icons/hi';
import toast from '../../utils/notify';

export default function SalesPage() {
  const { currency } = useCurrency();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const { activeLocationId } = useActiveLocation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | paid | pending
  const [showModal, setShowModal] = useState(false);
  const [totalRevenue, setTotalRevenue] = useState(0);


  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.paymentStatus = filter;
      if (activeLocationId) params.locationId = activeLocationId;
      const { data } = await salesAPI.getAll(params);
      setSales(data.sales || []);
      setTotalRevenue(data.totalRevenue || 0);
    } catch (err) {
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [filter, activeLocationId]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const handlePaymentUpdate = async (id, newStatus) => {
    try {
      await salesAPI.updatePayment(id, newStatus);
      toast.success(`Marked as ${newStatus}`);
      loadSales();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const filteredSales = search
    ? sales.filter((s) =>
        (s.products?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.customers?.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : sales;

  return (
    <div className="sales-page" data-currency={currency}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Sales</h1>
            <p>
              {filteredSales.length} records
              {totalRevenue > 0 && <> &middot; Total: <strong className="currency">{formatMoney(totalRevenue)}</strong></>}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <HiOutlinePlus /> Record Sale
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar">
          <HiOutlineSearch className="search-icon" />
          <input placeholder="Search sales..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'paid', 'pending'].map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Pending'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : filteredSales.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><HiOutlineShoppingCart /></div>
            <h3>No sales recorded</h3>
            <p>Record your first sale to start tracking revenue</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => setShowModal(true)}>
              <HiOutlinePlus /> Record Sale
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{shortDate(s.local_sale_date || s.sale_date || s.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{s.products?.name || '—'}</td>
                  <td className="text-right">{s.quantity}</td>
                  <td className="text-right currency">{formatMoney(s.unit_price)}</td>
                  <td className="text-right currency fw-600">{formatMoney(s.total_amount)}</td>
                  <td>
                    <span className={`badge ${s.payment_type === 'cash' ? 'badge-success' : 'badge-info'}`}>
                      {s.payment_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${s.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                      {s.payment_status === 'paid' ? <HiOutlineCheckCircle style={{ marginRight: 3 }} /> : <HiOutlineClock style={{ marginRight: 3 }} />}
                      {s.payment_status}
                    </span>
                  </td>
                  <td>
                    {s.payment_status === 'pending' && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handlePaymentUpdate(s.id, 'paid')}
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordSaleModal isOpen={showModal} onClose={() => setShowModal(false)} onSaved={loadSales} />
    </div>
  );
}

/* ── Record Sale Modal ──────────────────────── */
function RecordSaleModal({ isOpen, onClose, onSaved }) {
  const { user, isOwner } = useAuth();
  const { activeLocationId } = useActiveLocation();
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    product_id: '', customer_id: '', quantity: '1', unit_price: '',
    payment_type: 'cash', payment_status: 'paid'
  });
  const [saving, setSaving] = useState(false);

  // Autocomplete state for product search
  const [productQuery, setProductQuery] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  useEffect(() => {
    if (isOpen) {
      Promise.all([productsAPI.getAll(), customersAPI.getAll(), locationsAPI.getAll()])
        .then(([pRes, cRes, lRes]) => {
          setProducts(pRes.data.products || []);
          setCustomers(cRes.data.customers || []);
          setLocations(lRes.data.locations || []);
        })
        .catch(() => toast.error('Failed to load data'));
      // Pre-select the active shop so the sale records to the right location
      setForm({
        product_id: '', customer_id: '', quantity: '1', unit_price: '',
        payment_type: 'cash', payment_status: 'paid',
        location_id: activeLocationId || ''
      });
      setProductQuery('');
      setShowProductSuggestions(false);
    }
  }, [isOpen, user, activeLocationId]);

  const selectedProduct = products.find((p) => p.id === form.product_id);

  const handleProductChange = (pid) => {
    const p = products.find((x) => x.id === pid);
    setForm({ ...form, product_id: pid, unit_price: p ? p.selling_price.toString() : '' });
  };

  const total = (parseFloat(form.unit_price) || 0) * (parseInt(form.quantity) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id) return toast.error('Select a product');
    if (!form.quantity || parseInt(form.quantity) < 1) return toast.error('Enter quantity');
    if (!form.unit_price) return toast.error('Enter unit price');
    if (form.payment_type === 'credit' && !form.customer_id) return toast.error('Select customer for credit sale');

    setSaving(true);
    try {
      const payload = {
        product_id: form.product_id,
        quantity: parseInt(form.quantity),
        unit_price: parseFloat(form.unit_price),
        payment_type: form.payment_type,
        payment_status: form.payment_status,
        // include client local date and timezone so backend can align correctly
        sale_date: new Date().toLocaleDateString('en-CA'),
        sale_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      // assign location from form (owners can select, others use their assigned shop)
      if (isOwner) {
        if (form.location_id) payload.location_id = form.location_id;
      } else {
        payload.location_id = user?.locationId || null;
      }
      if (form.customer_id) payload.customer_id = form.customer_id;

      await salesAPI.create(payload);
      toast.success('Sale recorded!');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record a Sale"
      wide
      footer={
        <>
          <div style={{ flex: 1, fontSize: '1.1rem', fontWeight: 700 }}>
            Total: <span className="currency" style={{ color: 'var(--primary-dark)' }}>{formatMoney(total)}</span>
          </div>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Record Sale'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Product</label>
          <div style={{ position: 'relative' }}>
            <input
              className="form-input"
              placeholder="Type product name..."
              value={productQuery}
              onChange={(e) => {
                const q = e.target.value;
                setProductQuery(q);
                setShowProductSuggestions(true);
                // clear selected product if query no longer matches selected name
                const sel = products.find((p) => p.id === form.product_id);
                if (sel && !sel.name.toLowerCase().startsWith(q.toLowerCase())) {
                  setForm({ ...form, product_id: '' });
                }
              }}
              onFocus={() => setShowProductSuggestions(true)}
              onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
            />

            {/* Suggestions */}
            {showProductSuggestions && productQuery.trim().length > 0 && (
              <div className="autocomplete-list">
                {(products
                  .filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase()))
                  .sort((a, b) => {
                    const aq = a.name.toLowerCase().startsWith(productQuery.toLowerCase());
                    const bq = b.name.toLowerCase().startsWith(productQuery.toLowerCase());
                    if (aq === bq) return a.name.localeCompare(b.name);
                    return aq ? -1 : 1;
                  })
                  .slice(0, 8)
                ).map((p) => (
                  <div
                    key={p.id}
                    className="autocomplete-item"
                    onMouseDown={() => {
                      // use onMouseDown so blur doesn't hide before click
                      handleProductChange(p.id);
                      setProductQuery(p.name);
                      setShowProductSuggestions(false);
                    }}
                  >
                    {p.name}
                  </div>
                ))}
                {products.filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase())).length === 0 && (
                  <div className="autocomplete-no-results">No products found</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Quantity</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max={selectedProduct?.quantity || 99999}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            {selectedProduct && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Available: {selectedProduct.quantity}
              </p>
            )}
          </div>
          <div className="form-group">
            <label>Unit Price ({getCurrencyCode()})</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0"
              value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Payment Type</label>
            <select
              className="form-select"
              value={form.payment_type}
              onChange={(e) => setForm({
                ...form,
                payment_type: e.target.value,
                payment_status: e.target.value === 'cash' ? 'paid' : 'pending',
              })}
            >
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div className="form-group">
            <label>Payment Status</label>
            <select
              className="form-select"
              value={form.payment_status}
              onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
            >
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ minWidth: 200 }}>
            <label>Shop</label>
            {isOwner ? (
              <select className="form-select" value={form.location_id || ''} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                <option value="">All / Main</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            ) : (
              <input className="form-input" disabled value={locations.find(x => x.id === user?.locationId)?.name || 'Main'} />
            )}
          </div>
        </div>

        {form.payment_type === 'credit' && (
          <div className="form-group">
            <label>Customer</label>
            <select
              className="form-select"
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.total_debt > 0 ? `(owes ${formatMoney(c.total_debt)})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </Modal>
  );
}
