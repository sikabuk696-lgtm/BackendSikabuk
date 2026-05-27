import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { pendingAPI } from '../../services/api';
import {
  HiOutlineViewGrid,
  HiOutlineCube,
  HiOutlineShoppingCart,
  HiOutlineUsers,
  HiOutlineCash,
  HiOutlineUserGroup,
  HiOutlineChartBar,
  HiOutlineShoppingBag,
  HiOutlineLogout,
  HiOutlineDocumentText,
  HiOutlineClipboardCheck,
} from 'react-icons/hi';
import './Sidebar.css';
import SikaBukLogo from '../SikaBukLogo';

const navItems = [
  { to: '/dashboard', icon: HiOutlineViewGrid,      label: 'Dashboard' },
  { to: '/products',  icon: HiOutlineCube,          label: 'Products' },
  { to: '/sales',     icon: HiOutlineShoppingCart,  label: 'Sales' },
  { to: '/batches',   icon: HiOutlineDocumentText,  label: 'Daily Batches' },
  { to: '/customers', icon: HiOutlineUsers,         label: 'Customers' },
  { to: '/expenses',  icon: HiOutlineCash,          label: 'Expenses',     ownerOnly: true, expensesAllowed: true },
  { to: '/approvals', icon: HiOutlineClipboardCheck,label: 'Approvals',    ownerOnly: true, badge: true },
  { to: '/workers',   icon: HiOutlineUserGroup,     label: 'Workers',      ownerOnly: true },
  { to: '/shops',     icon: HiOutlineShoppingBag,   label: 'Shops',        ownerOnly: true },
  { to: '/reports',   icon: HiOutlineChartBar,      label: 'Reports' },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, isOwner, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    if (!isOwner) return;
    try {
      const { data } = await pendingAPI.count();
      setPendingCount(data.count || 0);
    } catch {
      // silently ignore
    }
  }, [isOwner]);

  useEffect(() => {
    fetchPendingCount();
    const handler = () => fetchPendingCount();
    window.addEventListener('sikabuk:pendingChanged', handler);
    // Poll every 15s so the badge stays current
    const interval = setInterval(fetchPendingCount, 15000);
    return () => {
      window.removeEventListener('sikabuk:pendingChanged', handler);
      clearInterval(interval);
    };
  }, [fetchPendingCount]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const canSeeExpenses = isOwner || ['manager', 'accountant'].includes(user?.role);
  const filteredItems = navItems.filter((item) => {
    if (item.expensesAllowed) return canSeeExpenses;
    if (item.ownerOnly) return isOwner;
    return true;
  });

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon"><SikaBukLogo size={30} /></div>
          <div className="logo-text">
            <span className="logo-name">₵ikaBuk</span>
            <span className="logo-tagline">Money Book</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Menu</div>
          {filteredItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
              {item.badge && pendingCount > 0 && (
                <span className="nav-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">
              {(user?.workerName || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.workerName || 'User'}</span>
              <span className="user-role">{{
                owner:         'Owner',
                cofounder:     'Co-Founder',
                manager:       'Manager',
                accountant:    'Accountant',
                cashier:       'Cashier',
                stock_manager: 'Stock Manager',
                worker:        'Worker',
              }[user?.role] || 'Worker'}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            <HiOutlineLogout />
          </button>
        </div>
      </aside>
    </>
  );
}

