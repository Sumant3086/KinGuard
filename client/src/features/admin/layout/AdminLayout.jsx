import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import logoImg from '../../../assets/img/logo 32px32px.png';
import NotificationBell from '../../../shared/components/NotificationBell';
import { getNotifications } from '../../../shared/api/adminApi';

const Icons = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  upload:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  inventory: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/></svg>,
  reports:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  stores:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  users:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  audit:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v2"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.5-1.5"/></svg>,
  analytics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20h20"/></svg>,
  batches:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  menu:      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  close:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  logout:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const NAV = [
  { to: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/admin/upload',    icon: 'upload',    label: 'Upload' },
  { to: '/admin/batches',   icon: 'batches',   label: 'Cycles' },
  { to: '/admin/inventory', icon: 'inventory', label: 'Submissions' },
  { to: '/admin/reports',   icon: 'reports',   label: 'Reports' },
  { to: '/admin/analytics', icon: 'analytics', label: 'Analytics' },
  { divider: true },
  { to: '/admin/stores',    icon: 'stores',    label: 'Stores'  },
  { to: '/admin/users',     icon: 'users',     label: 'Users' },
  { to: '/admin/audit-logs',icon: 'audit',     label: 'Activity Log' },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = p => location.pathname === p;
  const initials = user?.name
    ? user.name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'A'
    : 'A';

  return (
    <div className="hl-shell">
      <nav className="hl-nav">
        <Link to="/admin/dashboard" className="hl-brand">
          <img src={logoImg} alt="KinMarché" className="hl-logo-img" />
          <div className="hl-brand-text">
            <span className="hl-name">KinMarché</span>
            <span className="hl-tagline">Loss &amp; Prevention</span>
          </div>
        </Link>

        <div className="hl-links">
          {NAV.map((item, i) => {
            if (item.divider) return <div key={i} className="hl-sep" />;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`hl-link${isActive(item.to) ? ' active' : ''}`}
              >
                <span className="hl-link-icon">{Icons[item.icon]}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="hl-right">
          <NotificationBell fetcher={getNotifications} role="ADMIN" />
          <div className="hl-avatar">{initials}</div>
          <div className="hl-user-info">
            <span className="hl-emp">{user?.employeeId}</span>
            <span className="hl-role">Admin</span>
          </div>
          <button className="hl-signout" onClick={logout}>
            {Icons.logout}
            <span>Sign Out</span>
          </button>
          <button className="hl-hamburger" onClick={() => setMobileOpen(o => !o)}>
            {mobileOpen ? Icons.close : Icons.menu}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <>
          <div className="hl-overlay" onClick={() => setMobileOpen(false)} />
          <div className="hl-mobile-menu">
            {NAV.map((item, i) => {
              if (item.divider) return <div key={i} className="hl-mob-sep" />;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`hl-mob-link${isActive(item.to) ? ' active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="hl-mob-icon">{Icons[item.icon]}</span>
                  {item.label}
                </Link>
              );
            })}
            <div className="hl-mob-sep" />
            <button className="hl-mob-logout" onClick={logout}>
              {Icons.logout} Sign Out
            </button>
          </div>
        </>
      )}

      <main className="hl-content">
        {children}
        <div className="dev-credit">Developed by Sumant Yadav</div>
      </main>
    </div>
  );
}
