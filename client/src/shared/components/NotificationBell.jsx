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

const DISMISS_KEY = 'notif:dismissed';

function getDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveDismissed(set) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set].slice(-50))); }
  catch {}
}

// Build a stable key from a notification's identifying fields
function notifKey(item) {
  return `${item.type}:${item.batchId ?? ''}:${item.message?.slice(0, 30) ?? ''}`;
}

export default function NotificationBell({ fetcher, role }) {
  const [data,      setData]      = useState({ items: [], count: 0 });
  const [dismissed, setDismissed] = useState(getDismissed);
  const [open,      setOpen]      = useState(false);
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

  // Fetch on mount, poll every 60 s, and refresh immediately when tab regains focus
  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    function onVisible() { if (document.visibilityState === 'visible') load(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
    dismiss(item);
    setOpen(false);
    const base = resolveNav(item.type, role);
    const path = item.batchId ? `${base}?batchId=${item.batchId}` : base;
    navigate(path);
  }

  function dismiss(item) {
    const key  = notifKey(item);
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    saveDismissed(next);
  }

  function dismissAll() {
    const next = new Set(dismissed);
    data.items.forEach(i => next.add(notifKey(i)));
    setDismissed(next);
    saveDismissed(next);
  }

  const visibleItems = data.items.filter(i => !dismissed.has(notifKey(i)));
  const hasUrgent    = visibleItems.some(i => i.urgent);

  return (
    <div ref={ref} className="notif-wrap">
      <button
        className={`notif-bell${hasUrgent ? ' notif-bell-urgent' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${data.count > 0 ? ` (${data.count})` : ''}`}
      >
        <BellIcon />
        {visibleItems.length > 0 && (
          <span className="notif-badge">{visibleItems.length > 9 ? '9+' : visibleItems.length}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            {visibleItems.length > 0 && (
              <button
                onClick={dismissAll}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
              >
                Clear all
              </button>
            )}
          </div>

          {visibleItems.length === 0 ? (
            <div className="notif-empty">
              <span>✓</span>
              No pending notifications.
            </div>
          ) : (
            visibleItems.map((item, i) => (
              <div
                key={`${item.type}-${item.batchId ?? ''}-${i}`}
                style={{ display: 'flex', alignItems: 'stretch' }}
              >
                <button
                  className={`notif-item${item.urgent ? ' notif-item-urgent' : ''}`}
                  onClick={() => handleItem(item)}
                  style={{ flex: 1 }}
                >
                  <span
                    className="notif-dot"
                    style={{ background: typeDot[item.type] ?? '#64748b' }}
                  />
                  <span className="notif-msg">{item.message}</span>
                  <span className="notif-arrow">›</span>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); dismiss(item); }}
                  aria-label="Dismiss"
                  style={{ padding: '0 10px', fontSize: 16, color: 'var(--tx3)', background: 'none', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--red-border)', flexShrink: 0 }}
                >×</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
