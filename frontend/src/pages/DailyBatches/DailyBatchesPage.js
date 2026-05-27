import React, { useState, useEffect, useCallback } from 'react';
import { salesAPI } from '../../services/api';
import { formatDate, formatMoney } from '../../utils/helpers';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useActiveLocation } from '../../context/ActiveLocationContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineEye,
  HiOutlineSearch,
  HiOutlineCalendar,
  HiOutlineCurrencyDollar,
  HiOutlineShoppingBag,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import toast from '../../utils/notify';

export default function DailyBatchesPage() {
  const { isOwner } = useAuth();
  const { currency } = useCurrency();
  const { activeLocationId, locations } = useActiveLocation();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | approved | unapproved
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState(new Set());
  const [batchSales, setBatchSales] = useState({}); // Cache for batch sales data
  const [salesPagination, setSalesPagination] = useState({}); // Pagination state per batch


  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeLocationId) params.locationId = activeLocationId;
      const { data } = await salesAPI.getBatches(params);
      setBatches(data.batches || []);
      // Clear any expanded batch state and cached sales so stale data
      // from the previous shop never shows for the new shop's batches.
      setExpandedBatches(new Set());
      setBatchSales({});
      setSalesPagination({});
    } catch (err) {
      toast.error('Failed to load daily batches');
    } finally {
      setLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleApproveBatch = async (batchId) => {
    if (!isOwner) {
      toast.error('Only owners can approve batches');
      return;
    }

    try {
      await salesAPI.approveBatch(batchId);
      toast.success('Daily batch approved successfully!');
      loadBatches();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve batch');
    }
  };

  const handleViewBatch = async (batch) => {
    try {
      const { data } = await salesAPI.getBatchDetails(batch.id);
      setSelectedBatch(data);
      setShowBatchModal(true);
    } catch (err) {
      toast.error('Failed to load batch details');
    }
  };

  const toggleBatchExpansion = async (batchId) => {
    // Accordion behavior: only one batch open at a time
    if (expandedBatches.has(batchId)) {
      // Close if already open
      setExpandedBatches(new Set());
    } else {
      // Close all others and open this one
      setExpandedBatches(new Set([batchId]));
      
      // Load sales data if not already cached
      if (!batchSales[batchId]) {
        try {
          const { data } = await salesAPI.getBatchDetails(batchId);
          // cache sales
          setBatchSales(prev => ({ ...prev, [batchId]: data.sales }));
          setSalesPagination(prev => ({ 
            ...prev, 
            [batchId]: { page: 1, pageSize: 10, total: data.sales.length } 
          }));

          // store business timezone on the batch so expanded rows can render times in that tz
          if (data.batch?.business_timezone) {
            setBatches(prev => prev.map(b => b.id === batchId ? { ...b, business_timezone: data.batch.business_timezone } : b));
          }
        } catch (err) {
          toast.error('Failed to load batch sales');
          return;
        }
      }
    }
  };

  const loadMoreSales = (batchId) => {
    setSalesPagination(prev => ({
      ...prev,
      [batchId]: {
        ...prev[batchId],
        page: prev[batchId].page + 1
      }
    }));
  };

  const filteredBatches = batches.filter((batch) => {
    const matchesSearch = !search ||
      formatDate(batch.batch_date).toLowerCase().includes(search.toLowerCase()) ||
      batch.total_sales.toString().includes(search) ||
      formatMoney(batch.total_revenue).toLowerCase().includes(search.toLowerCase());

    const matchesFilter = filter === 'all' ||
      (filter === 'approved' && batch.approved) ||
      (filter === 'unapproved' && !batch.approved);

    return matchesSearch && matchesFilter;
  });

  // Group batches by month for better organization
  const groupedBatches = filteredBatches.reduce((groups, batch) => {
    // Safely parse date-only strings (YYYY-MM-DD) as local dates to avoid UTC shift
    const parseToDate = (d) => {
      if (!d) return new Date();
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day);
      }
      return new Date(d);
    };

    const dt = parseToDate(batch.batch_date);
    const monthKey = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(batch);
    return groups;
  }, {});

  const totalRevenue = filteredBatches.reduce((sum, batch) => sum + parseFloat(batch.total_revenue), 0);
  const totalSales = filteredBatches.reduce((sum, batch) => sum + parseInt(batch.total_sales), 0);
  const approvedCount = filteredBatches.filter(b => b.approved).length;
  const isAllShopsView = !activeLocationId;
  const getBatchShopName = (batch) => {
    if (batch?.locations?.name) return batch.locations.name;
    if (batch?.location_id) {
      const found = locations.find((l) => l.id === batch.location_id);
      if (found?.name) return found.name;
    }
    return 'Unassigned';
  };

  return (
    <div className="batches-page" data-currency={currency}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Daily Batches</h1>
            <p>
              {isAllShopsView
                ? 'All shops view. Review and approve each shop batch separately.'
                : 'Single shop view. You are reviewing one shop at a time.'}
              {' '}
              {filteredBatches.length} batches
              {totalRevenue > 0 && <> &middot; Total: <strong className="currency">{formatMoney(totalRevenue)}</strong></>}
              {approvedCount > 0 && <> &middot; {approvedCount} approved</>}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon">
            <HiOutlineDocumentText />
          </div>
          <div className="stat-content">
            <div className="stat-value">{filteredBatches.length}</div>
            <div className="stat-label">Total Batches</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HiOutlineShoppingBag />
          </div>
          <div className="stat-content">
            <div className="stat-value">{totalSales}</div>
            <div className="stat-label">Total Sales</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HiOutlineCurrencyDollar />
          </div>
          <div className="stat-content">
            <div className="stat-value currency">{formatMoney(totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HiOutlineCheckCircle />
          </div>
          <div className="stat-content">
            <div className="stat-value">{approvedCount}</div>
            <div className="stat-label">Approved</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar">
          <HiOutlineSearch className="search-icon" />
          <input
            placeholder="Search batches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'approved', label: 'Approved' },
            { key: 'unapproved', label: 'Unapproved' }
          ].map((f) => (
            <button
              key={f.key}
              className={`btn btn-sm ${filter === f.key ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batches by Month */}
      {loading ? (
        <div className="loading-inline"><div className="spinner" /></div>
      ) : Object.keys(groupedBatches).length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><HiOutlineDocumentText /></div>
            <h3>No daily batches found</h3>
            <p>Daily batches will appear here as sales are recorded</p>
          </div>
        </div>
      ) : (
        Object.entries(groupedBatches)
          .sort(([a], [b]) => new Date(b) - new Date(a)) // Most recent months first
          .map(([month, monthBatches]) => (
            <div key={month} style={{ marginBottom: 32 }}>
              <div style={{ marginBottom: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                  <HiOutlineCalendar style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  {month}
                </h3>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {monthBatches.length} batch{monthBatches.length !== 1 ? 'es' : ''} &middot; {' '}
                  {formatMoney(monthBatches.reduce((sum, b) => sum + parseFloat(b.total_revenue), 0))}
                </div>
              </div>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '200px' }}>Date</th>
                      {isAllShopsView && <th style={{ width: '170px' }}>Shop</th>}
                      <th className="text-right" style={{ width: '80px' }}>Sales</th>
                      <th className="text-right" style={{ width: '120px' }}>Revenue</th>
                      <th style={{ width: '120px' }}>Status</th>
                      <th style={{ width: '120px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthBatches
                      .sort((a, b) => new Date(b.batch_date) - new Date(a.batch_date)) // Most recent dates first
                      .map((batch) => {
                        const isExpanded = expandedBatches.has(batch.id);
                        const sales = batchSales[batch.id] || [];
                        const pagination = salesPagination[batch.id] || { page: 1, pageSize: 10, total: 0 };
                        const visibleSales = sales.slice(0, pagination.page * pagination.pageSize);
                        const hasMoreSales = sales.length > visibleSales.length;
                        
                        return (
                          <React.Fragment key={batch.id}>
                            <tr className="batch-row">
                              <td 
                                style={{ 
                                  fontWeight: 600, 
                                  cursor: 'pointer',
                                  padding: '12px 16px',
                                  transition: 'background-color 0.2s ease'
                                }}
                                onClick={() => toggleBatchExpansion(batch.id)}
                                className="hover-highlight"
                                title={isExpanded ? "Click to collapse sales" : "Click to expand sales"}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {isExpanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                                  {formatDate(batch.batch_date)}
                                </div>
                              </td>
                              {isAllShopsView && (
                                <td>
                                  <span className="badge badge-info" title="Shop this batch belongs to">
                                    {getBatchShopName(batch)}
                                  </span>
                                </td>
                              )}
                              <td className="text-right">{batch.total_sales}</td>
                              <td className="text-right currency fw-600">
                                {formatMoney(batch.total_revenue)}
                              </td>
                              <td>
                                <span className={`badge ${batch.approved ? 'badge-success' : 'badge-warning'}`}>
                                  {batch.approved ? (
                                    <>
                                      <HiOutlineCheckCircle style={{ marginRight: 3 }} />
                                      Approved
                                    </>
                                  ) : (
                                    <>
                                      <HiOutlineClock style={{ marginRight: 3 }} />
                                      Pending
                                    </>
                                  )}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => handleViewBatch(batch)}
                                    title="View full batch details"
                                  >
                                    <HiOutlineEye />
                                  </button>
                                  {!batch.approved && isOwner && (
                                    <button
                                      className="btn btn-success btn-sm"
                                      onClick={() => handleApproveBatch(batch.id)}
                                      title="Approve this batch"
                                    >
                                      <HiOutlineCheckCircle />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="batch-expanded-row">
                                <td colSpan={isAllShopsView ? 6 : 5} style={{ padding: 0 }}>
                                  <div className="batch-expanded-section">
                                    <div className="batch-expanded-header">
                                      <h4 style={{ margin: 0, fontWeight: 800 }}>
                                        Sales in this batch ({batch.total_sales} total)
                                        {isAllShopsView && (
                                          <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--text-muted)' }}>
                                            • {getBatchShopName(batch)}
                                          </span>
                                        )}
                                      </h4>
                                      {batch.total_sales > 30 && (
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                          Showing {visibleSales.length} of {batch.total_sales} sales
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="table-container extended-table-container">
                                      <table className="data-table expanded-sales-table" style={{ margin: 0 }}>
                                        <thead>
                                          <tr>
                                            <th style={{ width: '80px' }}>Time</th>
                                            <th style={{ width: '200px' }}>Product</th>
                                            <th className="text-right" style={{ width: '80px' }}>Qty</th>
                                            <th className="text-right" style={{ width: '100px' }}>Unit Price</th>
                                            <th className="text-right" style={{ width: '100px' }}>Total</th>
                                            <th style={{ width: '80px' }}>Payment</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {visibleSales.map((sale) => (
                                            <tr key={sale.id} className="expanded-row-item">
                                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                                {new Date(sale.created_at).toLocaleTimeString('en-US', {
                                                  timeZone: batch.business_timezone || undefined,
                                                  hour: '2-digit',
                                                  minute: '2-digit'
                                                })}
                                              </td>
                                              <td style={{ fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {sale.products?.name || '—'}
                                              </td>
                                              <td className="text-right">{sale.quantity}</td>
                                              <td className="text-right currency">{formatMoney(sale.unit_price)}</td>
                                              <td className="text-right currency fw-600">{formatMoney(sale.total_amount)}</td>
                                              <td>
                                                <span className={`badge badge-sm ${sale.payment_type === 'cash' ? 'badge-success' : 'badge-info'}`}>
                                                  {sale.payment_type}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}

                                          {/* Summary row: total quantity & total revenue for the entire batch */}
                                          {(() => {
                                            const allSales = batchSales[batch.id] || visibleSales || [];
                                            const totalQty = allSales.reduce((s, it) => s + (parseInt(it.quantity || 0, 10) || 0), 0);
                                            const totalAmt = allSales.reduce((s, it) => s + (parseFloat(it.total_amount || 0) || 0), 0);
                                            return (
                                              <tr className="expanded-row-summary">
                                                <td />
                                                <td style={{ fontWeight: 800 }}>Batch total</td>
                                                <td className="text-right" style={{ fontWeight: 800 }}>{totalQty}</td>
                                                <td />
                                                <td className="text-right currency fw-700" style={{ fontWeight: 800 }}>{formatMoney(totalAmt)}</td>
                                                <td />
                                              </tr>
                                            );
                                          })()}
                                        </tbody>
                                      </table>
                                    </div>
                                    
                                    {hasMoreSales && (
                                      <div style={{ textAlign: 'center', marginTop: 16 }}>
                                        <button
                                          className="btn btn-outline"
                                          onClick={() => loadMoreSales(batch.id)}
                                        >
                                          Load More Sales ({batch.total_sales - visibleSales.length} remaining)
                                          <HiOutlineChevronDown style={{ marginLeft: 8 }} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
      )}

      <BatchDetailsModal
        batch={selectedBatch}
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
      />
    </div>
  );
}

/* ── Batch Details Modal ──────────────────────── */
function BatchDetailsModal({ batch, isOpen, onClose }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20); // Show 20 sales per page in modal
  
  if (!batch) return null;

  const totalSales = batch.sales.length;
  const totalPages = Math.ceil(totalSales / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentSales = batch.sales.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Daily Batch - ${formatDate(batch.batch.batch_date)}`}
      wide
      size="large"
    >
      <div style={{ marginBottom: 24 }}>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <HiOutlineShoppingBag />
            </div>
            <div className="stat-content">
              <div className="stat-value">{batch.batch.total_sales}</div>
              <div className="stat-label">Total Sales</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <HiOutlineCurrencyDollar />
            </div>
            <div className="stat-content">
              <div className="stat-value currency">{formatMoney(batch.batch.total_revenue)}</div>
              <div className="stat-label">Total Revenue</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              {batch.batch.approved ? <HiOutlineCheckCircle /> : <HiOutlineClock />}
            </div>
            <div className="stat-content">
              <div className="stat-value">
                {batch.batch.approved ? 'Approved' : 'Pending'}
              </div>
              <div className="stat-label">Status</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h4 style={{ margin: 0 }}>Sales in this batch ({batch.batch.total_sales} total)</h4>
        {totalPages > 1 && (
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Page {currentPage} of {totalPages} • Showing {startIndex + 1}-{Math.min(endIndex, totalSales)} of {totalSales}
          </div>
        )}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Time</th>
              <th style={{ width: '200px' }}>Product</th>
              <th className="text-right" style={{ width: '80px' }}>Qty</th>
              <th className="text-right" style={{ width: '100px' }}>Unit Price</th>
              <th className="text-right" style={{ width: '100px' }}>Total</th>
              <th style={{ width: '80px' }}>Payment</th>
            </tr>
          </thead>
          <tbody>
            {currentSales.map((sale) => (
              <tr key={sale.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                  {new Date(sale.created_at).toLocaleTimeString('en-US', {
                    timeZone: batch.batch.business_timezone || undefined,
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td style={{ fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sale.products?.name || '—'}</td>
                <td className="text-right">{sale.quantity}</td>
                <td className="text-right currency">{formatMoney(sale.unit_price)}</td>
                <td className="text-right currency fw-600">{formatMoney(sale.total_amount)}</td>
                <td>
                  <span className={`badge ${sale.payment_type === 'cash' ? 'badge-success' : 'badge-info'}`}>
                    {sale.payment_type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <HiOutlineChevronLeft /> Previous
          </button>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (pageNum > totalPages) return null;
              
              return (
                <button
                  key={pageNum}
                  className={`btn btn-sm ${currentPage === pageNum ? 'btn-secondary' : 'btn-outline'}`}
                  onClick={() => goToPage(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            className="btn btn-outline btn-sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <HiOutlineChevronRight />
          </button>
        </div>
      )}
    </Modal>
  );
}
