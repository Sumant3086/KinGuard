import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Icons = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  upload:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  inventory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>,
  reports:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/></svg>,
  stores:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  users:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  audit:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v2"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.5-1.5"/></svg>,
  analytics: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20h20"/></svg>,
  batches:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  logout:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  menu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  close:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const NAV = [
  { to: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard'  },
  { to: '/admin/upload',    icon: 'upload',    label: 'Upload File' },
  { to: '/admin/inventory', icon: 'inventory', label: 'Inventory'  },
  { to: '/admin/reports',   icon: 'reports',   label: 'Reports'    },
  { to: '/admin/analytics', icon: 'analytics', label: 'Analytics'  },
  { to: '/admin/batches',   icon: 'batches',   label: 'Batches'    },
  { to: '/admin/stores',    icon: 'stores',    label: 'Stores'     },
  { to: '/admin/users',     icon: 'users',     label: 'Users'      },
  { to: '/admin/audit-logs',icon: 'audit',     label: 'Audit Logs' },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = p => location.pathname === p;
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        {/* Left: Brand */}
        <Link to="/admin/dashboard" className="an-brand">
          <div className="an-logo">K</div>
          <div className="an-brand-text">
            <span className="an-name">KinMarché</span>
            <span className="an-sub">Loss &amp; Prevention</span>
          </div>
        </Link>

        {/* Center: Nav links */}
        <div className="an-links">
          {NAV.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`an-link ${isActive(item.to) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right: Identity + Sign Out */}
        <div className="an-right">
          <span className="an-badge">Admin</span>
          <span className="an-emp">{user?.employeeId}</span>
          <button className="an-signout" onClick={logout}>Sign Out</button>
          <button
            className="an-hamburger"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? Icons.close : Icons.menu}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="an-mobile-menu">
          {NAV.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`an-mob-link ${isActive(item.to) ? 'active' : ''}`}
            >
              <span className="an-mob-icon">{Icons[item.icon]}</span>
              {item.label}
            </Link>
          ))}
          <div className="an-mob-divider" />
          <div className="an-mob-user">
            <div className="an-mob-avatar">{initials}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)' }}>{user?.employeeId} · Administrator</div>
            </div>
          </div>
          <button className="an-mob-signout" onClick={logout}>Sign Out</button>
        </div>
      )}

      <main className="admin-content">
        {children}
      </main>
    </div>
  );
}
