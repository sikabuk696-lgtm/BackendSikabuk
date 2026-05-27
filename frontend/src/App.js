import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

/* Pages */
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ProductsPage from './pages/Products/ProductsPage';
import SalesPage from './pages/Sales/SalesPage';
import DailyBatchesPage from './pages/DailyBatches/DailyBatchesPage';
import CustomersPage from './pages/Customers/CustomersPage';
import ExpensesPage from './pages/Expenses/ExpensesPage';
import WorkersPage from './pages/Workers/WorkersPage';
import ShopsPage from './pages/Shops/ShopsPage';
import ReportsPage from './pages/Reports/ReportsPage';
import ApprovalsPage from './pages/Approvals/ApprovalsPage';

/* Layout */
import Sidebar from './components/Sidebar/Sidebar';
import MobileNav from './components/Sidebar/MobileNav';
import ErrorBoundary from './components/ErrorBoundary';
import HeaderShopSelector from './components/HeaderShopSelector/HeaderShopSelector';
import OfflineBanner from './components/OfflineBanner';
import { ActiveLocationProvider, useActiveLocation } from './context/ActiveLocationContext';
import { CurrencyProvider, useCurrency } from './context/CurrencyContext';
import OnboardingGuide, { shouldShowOnboarding, clearOnboardingFlag } from './components/OnboardingGuide/OnboardingGuide';

import { HiOutlineMenuAlt2, HiX, HiOutlineShoppingBag, HiOutlineLogout } from 'react-icons/hi';
import './App.css';
import SikaBukLogo from './components/SikaBukLogo';
import { NotificationProvider } from './context/NotificationContext';
import NotificationBell from './components/Notifications/NotificationBell';

/* ── Global Onboarding Guide ───────────────────── */
function GlobalOnboarding() {
  const { user } = useAuth();
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (user?.role === 'owner' && shouldShowOnboarding()) {
      clearOnboardingFlag();
      setShow(true);
    }
  }, [user]);
  if (!show) return null;
  return <OnboardingGuide onDone={() => setShow(false)} />;
}

/* ── Protected Route Wrapper ─────────────────── */
function RequireAuth({ children, ownerOnly, expensesAllowed }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-icon">
          <SikaBukLogo size={56} />
        </div>
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (ownerOnly && user.role !== 'owner' && user.role !== 'cofounder') {
    return <Navigate to="/dashboard" replace />;
  }
  if (expensesAllowed && !['owner', 'cofounder', 'manager', 'accountant'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

/* ── Mobile menu dropdown panel ────────────── */
function MobileMenuPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { locations, loading, activeLocationId, setActive } = useActiveLocation();
  const { currency, ghsToUsd, rateLoading, rateError, lastUpdated, toggle: toggleCurrency } = useCurrency();
  const [local, setLocal] = React.useState(activeLocationId || '');

  React.useEffect(() => setLocal(activeLocationId || ''), [activeLocationId]);

  const handleChange = (e) => {
    const val = e.target.value || '';
    setLocal(val);
    setActive(val);
  };

  const firstName = (user?.name || user?.email || '').split(/[\s@]/)[0] || 'there';
  const isOwnerOrCofounder = user?.role === 'owner' || user?.role === 'cofounder';

  const currentShopName = () => {
    if (local) return locations.find(l => l.id === local)?.name || user?.businessName || 'Main';
    if (user?.locationId) return locations.find(l => l.id === user.locationId)?.name || user?.businessName || 'Main';
    return 'All Shops';
  };

  return (
    <div className="mmenu-panel">
      {/* Greeting row */}
      <div className="mmenu-greeting">
        <div className="mmenu-avatar">{firstName[0]?.toUpperCase()}</div>
        <div>
          <div className="mmenu-hi">Hi, {firstName}</div>
          <div className="mmenu-biz">{user?.businessName || '₵ikaBuk'}</div>
        </div>
      </div>

      <div className="mmenu-divider" />

      {/* Active location section */}
      <div className="mmenu-section">
        <div className="mmenu-section-label">
          <HiOutlineShoppingBag size={12} /> Active Location
        </div>
        {loading && (!locations || locations.length === 0) ? (
          <div className="mmenu-placeholder">Loading locations…</div>
        ) : isOwnerOrCofounder ? (
          <select className="mmenu-select" value={local} onChange={handleChange}>
            <option value="">All Shops</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        ) : (
          <div className="mmenu-shop-badge">{currentShopName()}</div>
        )}
      </div>

      <div className="mmenu-divider" />

      {/* Currency section */}
      <div className="mmenu-section">
        <div className="mmenu-section-label">
          <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>₵</span> Currency
        </div>
        <div className="mmenu-ccy-row">
          <button
            className={`mmenu-ccy-pill${currency === 'GHS' ? ' active-ghs' : ''}`}
            onClick={currency !== 'GHS' ? toggleCurrency : undefined}
          >
            GHS · ₵
          </button>
          <button
            className={`mmenu-ccy-pill${currency === 'USD' ? ' active-usd' : ''}`}
            onClick={currency !== 'USD' ? toggleCurrency : undefined}
          >
            USD · $
          </button>
        </div>
        {currency === 'USD' && rateLoading && (
          <div className="mmenu-rate">Fetching rate…</div>
        )}
        {currency === 'USD' && !rateLoading && rateError && (
          <div className="mmenu-rate mmenu-rate-err">Rate unavailable</div>
        )}
        {currency === 'USD' && !rateLoading && !rateError && ghsToUsd != null && (
          <div className="mmenu-rate">
            1 GH₵ = ${ghsToUsd.toFixed(4)}
            {lastUpdated && (
              <span> · {lastUpdated.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        )}
      </div>

      <div className="mmenu-divider" />

      {/* Sign out */}
      <div className="mmenu-section">
        <button
          className="mmenu-logout-btn"
          onClick={async () => { await logout(); navigate('/login'); }}
        >
          <HiOutlineLogout size={17} /> Sign Out
        </button>
      </div>
    </div>
  );
}

/* ── Authenticated Layout (Sidebar + Content) ── */
function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuPanelOpen, setMenuPanelOpen] = React.useState(false);

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Desktop topbar */}
      <div className="app-topbar">
        <NotificationBell />
        <HeaderShopSelector />
      </div>

      {/* Mobile topbar — logo left, bell + menu button right */}
      <div className="mobile-topbar">
        <div className="mobile-topbar-brand">
          <SikaBukLogo size={26} />
          <span className="mobile-topbar-name">₵ikaBuk</span>
        </div>
        <div className="mobile-topbar-actions">
          <NotificationBell />
          <button
            className="mobile-topbar-menu-btn"
            onClick={() => setMenuPanelOpen(prev => !prev)}
            aria-label="Toggle menu"
          >
            {menuPanelOpen ? <HiX size={22} /> : <HiOutlineMenuAlt2 size={22} />}
          </button>
        </div>
      </div>

      {/* Slide-down panel with shop + currency controls */}
      {menuPanelOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setMenuPanelOpen(false)} />
          <MobileMenuPanel />
        </>
      )}

      <main className="main-content">
        {children}
      </main>
      <MobileNav
        onMenuOpen={() => setMobileOpen(prev => !prev)}
        mobileOpen={mobileOpen}
      />
    </div>
  );
}

/* ── App Root ──────────────────────────────────── */
function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected */}
      <Route path="/dashboard" element={
        <RequireAuth><AppLayout><DashboardPage /></AppLayout></RequireAuth>
      } />
      <Route path="/products" element={
        <RequireAuth><AppLayout><ProductsPage /></AppLayout></RequireAuth>
      } />
      <Route path="/sales" element={
        <RequireAuth><AppLayout><SalesPage /></AppLayout></RequireAuth>
      } />
      <Route path="/batches" element={
        <RequireAuth><AppLayout><DailyBatchesPage /></AppLayout></RequireAuth>
      } />
      <Route path="/customers" element={
        <RequireAuth><AppLayout><CustomersPage /></AppLayout></RequireAuth>
      } />
      <Route path="/expenses" element={
        <RequireAuth expensesAllowed><AppLayout><ExpensesPage /></AppLayout></RequireAuth>
      } />
      <Route path="/workers" element={
        <RequireAuth ownerOnly><AppLayout><WorkersPage /></AppLayout></RequireAuth>
      } />
      <Route path="/shops" element={
        <RequireAuth ownerOnly><AppLayout><ShopsPage /></AppLayout></RequireAuth>
      } />
      <Route path="/reports" element={
        <RequireAuth><AppLayout><ReportsPage /></AppLayout></RequireAuth>
      } />
      <Route path="/approvals" element={
        <RequireAuth ownerOnly><AppLayout><ApprovalsPage /></AppLayout></RequireAuth>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ActiveLocationProvider>
          <CurrencyProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <NotificationProvider>
            <OfflineBanner />
            <AppRoutes />
            <GlobalOnboarding />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3500,
                style: {
                  borderRadius: '12px',
                  background: '#2A1F14',
                  color: '#FDF6E8',
                  fontSize: '0.88rem',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                },
              }}
            />
            </NotificationProvider>
          </Router>
          </CurrencyProvider>
        </ActiveLocationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
