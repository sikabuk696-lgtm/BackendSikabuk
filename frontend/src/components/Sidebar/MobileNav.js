import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  HiOutlineViewGrid,
  HiOutlineCube,
  HiOutlineShoppingCart,
  HiOutlineUsers,
  HiOutlineDotsHorizontal,
  HiX,
} from 'react-icons/hi';
import './Sidebar.css';

export default function MobileNav({ onMenuOpen, mobileOpen }) {
  return (
    <nav className="mobile-nav">
      <NavLink to="/dashboard" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <HiOutlineViewGrid className="nav-icon" />
        <span>Home</span>
      </NavLink>
      <NavLink to="/products" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <HiOutlineCube className="nav-icon" />
        <span>Products</span>
      </NavLink>
      <NavLink to="/sales" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <HiOutlineShoppingCart className="nav-icon" />
        <span>Sales</span>
      </NavLink>
      <NavLink to="/customers" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <HiOutlineUsers className="nav-icon" />
        <span>Customers</span>
      </NavLink>
      <button className={`mobile-nav-item${mobileOpen ? ' active' : ''}`} onClick={onMenuOpen}>
        {mobileOpen
          ? <HiX className="nav-icon" />
          : <HiOutlineDotsHorizontal className="nav-icon" />}
        <span>{mobileOpen ? 'Close' : 'More'}</span>
      </button>
    </nav>
  );
}
