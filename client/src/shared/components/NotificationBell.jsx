import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

// Resolve navigation path based on notification type and user role.
// Admin and store-manager roles need different destinations for the
// same notification type, so a single static map would have duplicate
// keys and silently overwrite the store-manager routes.
function resolveNav(type, role) {
  if (role === 'ADMIN') {
    return type === 'submitted' ? '/admin/inventory' : '/admin/batches';
  }
  if (role === 'AREA_MANAGER') {
    return '/am/review';
  }
  return '/store/inventory';
}

const typeDot = {
  new:       '#7c3aed',
  review:    '#d97706',
  returned:  '#dc2626',
  pending:   '#3b82f6',
  deadline:  '#d97706',
  overdue:   '#dc2626',
  submitted: '#16a34a',
};

export default function NotificationBell({ fetcher, role }) {
  const [data, setData] = useState({ items: [], count: 0 });
  const [open, setOpen] = useState(false);
  const ref     = useRef(null);
  const mounted = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await fetcher();
      if (mounted.current) setData(d);
    } catch {
      // 401 is handled globally by the axios interceptor (redirects to login).
      // Other transient failures are silently skipped so the bell stays visible.
    }
  }, [fetcher]);

  // Fetch on mount then poll every 60 s
  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function handleItem(item) {
    setOpen(false);
    const base = resolveNav(item.type, role);
    const path = item.batchId ? `${base}?batchId=${item.batchId}` : base;
    navigate(path);
  }

  const hasUrgent = data.items.some(i => i.urgent);

  return (
    <div ref={ref} className="notif-wrap">
      <button
        className={`notif-bell${hasUrgent ? ' notif-bell-urgent' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${data.count > 0 ? ` (${data.count})` : ''}`}
      >
        <BellIcon />
        {data.count > 0 && (
          <span className="notif-badge">{data.count > 9 ? '9+' : data.count}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            {data.count > 0 && <span className="notif-header-count">{data.count} new</span>}
          </div>

          {data.items.length === 0 ? (
            <div className="notif-empty">
              <span>✓</span>
              No pending notifications.
            </div>
          ) : (
            data.items.map((item, i) => (
              <button
                key={i}
                className={`notif-item${item.urgent ? ' notif-item-urgent' : ''}`}
                onClick={() => handleItem(item)}
              >
                <span
                  className="notif-dot"
                  style={{ background: typeDot[item.type] ?? '#64748b' }}
                />
                <span className="notif-msg">{item.message}</span>
                <span className="notif-arrow">›</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
