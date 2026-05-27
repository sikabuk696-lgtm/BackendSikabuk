import React, { useState, useRef, useEffect } from 'react';
import { HiOutlineBell } from 'react-icons/hi';
import { useNotifications } from '../../context/NotificationContext';
import './NotificationBell.css';

const TYPE_ICONS = {
  sale_created:     '💰',
  product_added:    '📦',
  product_updated:  '✏️',
  product_deleted:  '🗑️',
  product_pending:  '⏳',
  expense_added:    '💸',
  customer_added:   '👤',
  customer_pending: '⏳',
  worker_added:     '👷',
};

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getWorkerId() {
  try {
    const token = localStorage.getItem(
      process.env.REACT_APP_TOKEN_KEY || 'sikabook_token'
    );
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.workerId || payload.sub || null;
  } catch (_) {
    return null;
  }
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef   = useRef(null);
  const workerId = getWorkerId();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current   && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleItemClick(n) {
    if (!(n.read_by || []).includes(workerId)) {
      markRead(n.id);
    }
  }

  return (
    <div className="notif-bell-wrapper">
      <button
        ref={btnRef}
        className="notif-bell-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <HiOutlineBell className="notif-bell-icon" />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="notif-mark-all-btn"
                onClick={() => { markAllRead(); }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map(n => {
                const isUnread = !(n.read_by || []).includes(workerId);
                return (
                  <div
                    key={n.id}
                    className={`notif-item${isUnread ? ' notif-item--unread' : ''}`}
                    onClick={() => handleItemClick(n)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleItemClick(n)}
                  >
                    <span className="notif-item-icon">
                      {TYPE_ICONS[n.type] || '🔔'}
                    </span>
                    <div className="notif-item-body">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-msg">{n.message}</div>
                      <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                    </div>
                    {isUnread && <span className="notif-item-dot" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
