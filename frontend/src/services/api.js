import axios from 'axios';
import config from '../config';

const api = axios.create({
  baseURL: config.apiUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach JWT token to every request and log
api.interceptors.request.use((req) => {
  const token = localStorage.getItem(config.tokenKey);
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
    if (process.env.NODE_ENV === 'development') {
      console.log('[api] request', req.method, req.url);
    }
  return req;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[api] response', res.config.url, res.status);
    }
    return res;
  },
  (err) => {
    console.log('[api] response error', err.config?.url, err.response?.status, err.message);
    if (err.response?.status === 401) {
      localStorage.removeItem(config.tokenKey);
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  supabaseAuth: (data) => api.post('/api/auth/supabase-auth', data),
  workerLogin: (data) => api.post('/api/auth/worker-login', data),
  verify: () => api.get('/api/auth/verify'),
  ownerPinSetup: (data) => api.post('/api/auth/owner-pin/setup', data),
  ownerPinVerify: (data) => api.post('/api/auth/owner-pin/verify', data),
  updatePhone: (phone) => api.patch('/api/auth/phone', { phone }),
};

// ─── Products ────────────────────────────────────────
export const productsAPI = {
  getAll: (params) => api.get('/api/products', { params }),
  getLowStock: (params) => api.get('/api/products/low-stock', { params }),
  getOne: (id) => api.get(`/api/products/${id}`),
  create: (data) => api.post('/api/products', data),
  update: (id, data) => api.put(`/api/products/${id}`, data),
  delete: (id) => api.delete(`/api/products/${id}`),
  adjustQty: (id, change) => api.patch(`/api/products/${id}/quantity`, { change }),
  uploadExcel: (formData) =>
    api.post('/api/products/upload-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ─── Sales ───────────────────────────────────────────
export const salesAPI = {
  getAll: (params) => api.get('/api/sales', { params }),
  getSummary: (params) => api.get('/api/sales/summary', { params }),
  getOne: (id) => api.get(`/api/sales/${id}`),
  create: (data) => api.post('/api/sales', data),
  updatePayment: (id, status) => api.patch(`/api/sales/${id}/payment-status`, { status }),
  // Daily Batch Management
  getBatches: (params) => api.get('/api/sales/batches', { params }),
  getBatchDetails: (batchId) => api.get(`/api/sales/batches/${batchId}`),
  approveBatch: (batchId) => api.post(`/api/sales/batches/${batchId}/approve`),
};

// ─── Customers ───────────────────────────────────────
export const customersAPI = {
  getAll: (params) => api.get('/api/customers', { params }),
  getWithDebt: (params) => api.get('/api/customers/with-debt', { params }),
  getOne: (id) => api.get(`/api/customers/${id}`),
  create: (data) => api.post('/api/customers', data),
  update: (id, data) => api.put(`/api/customers/${id}`, data),
  delete: (id) => api.delete(`/api/customers/${id}`),
  adjustDebt: (id, change) => api.patch(`/api/customers/${id}/debt`, { change }),
};

// ─── Expenses ────────────────────────────────────────
export const expensesAPI = {
  getAll: (params) => api.get('/api/expenses', { params }),
  getByCategory: (params) => api.get('/api/expenses/by-category', { params }),
  getOne: (id) => api.get(`/api/expenses/${id}`),
  create: (data) => api.post('/api/expenses', data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  }),
  update: (id, data) => api.put(`/api/expenses/${id}`, data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  }),
  downloadAttachment: (id) => api.get(`/api/expenses/${id}/attachment/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/api/expenses/${id}`),
};

// ─── Analytics ───────────────────────────────────────
export const analyticsAPI = {
  dashboard: (params) => api.get('/api/analytics/dashboard', { params }),
  sales: (params) => api.get('/api/analytics/sales', { params }),
  topProducts: (params) => api.get('/api/analytics/top-products', { params }),
  salesTrend: (params) => api.get('/api/analytics/sales-trend', { params }),
  salesByHour: (params) => api.get('/api/analytics/sales-by-hour', { params }),
  expenses: (params) => api.get('/api/analytics/expenses', { params }),
};

// ─── Workers ─────────────────────────────────────────
export const workersAPI = {
  getAll: (params) => api.get('/api/workers', { params }),
  create: (data) => api.post('/api/workers', data),
  update: (id, data) => api.put(`/api/workers/${id}`, data),
  delete: (id) => api.delete(`/api/workers/${id}`),
  reactivate: (id) => api.post(`/api/workers/${id}/reactivate`),
  activity: (id) => api.get(`/api/workers/${id}/activity`),
};

// ─── Locations (Shops) ─────────────────────────────────
export const locationsAPI = {
  getAll: () => api.get('/api/locations'),
  create: (data) => api.post('/api/locations', data),
  update: (id, data) => api.put(`/api/locations/${id}`, data),
  delete: (id) => api.delete(`/api/locations/${id}`),
};

// ─── Pending Approvals (owner-only) ──────────────────
export const pendingAPI = {
  list:       (params) => api.get('/api/pending', { params }),
  count:      () => api.get('/api/pending/count'),
  mine:       (params) => api.get('/api/pending/mine', { params }),
  approve:    (id) => api.post(`/api/pending/${id}/approve`),
  reject:     (id, reason) => api.post(`/api/pending/${id}/reject`, { reason }),
  approveAll: () => api.post('/api/pending/approve-all'),
};

// ─── Notifications ──────────────────────────────────
export const notificationsAPI = {
  getAll:      (params) => api.get('/api/notifications', { params }),
  markRead:    (id) => api.patch(`/api/notifications/${id}/read`),
  markAllRead: () => api.patch('/api/notifications/mark-all-read'),
};

export default api;
