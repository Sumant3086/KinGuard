import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import logoImg from '../../../assets/img/logo 32px32px.png';
import NotificationBell from '../../../shared/components/NotificationBell';
import { getNotifications } from '../../../shared/api/amApi';

const Icons = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  review:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  menu:      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  close:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  logout:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const NAV = [
  { to: '/am/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/am/review',    icon: 'review',    label: 'Review Submissions' },
];

export default function AMLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = p => location.pathname === p || location.pathname.startsWith(p + '/');
  const initials = user?.name
    ? user.name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'AM';

  return (
    <div className="hl-shell am-shell">
      <nav className="hl-nav am-nav">
        <Link to="/am/dashboard" className="hl-brand">
          <img src={logoImg} alt="KinMarché" className="hl-logo-img" loading="eager" fetchPriority="high" />
          <div className="hl-brand-text">
            <span className="hl-name">KinMarché</span>
            <span className="hl-tagline">Area Manager</span>
          </div>
        </Link>

        <div className="hl-links">
          {NAV.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`hl-link${isActive(item.to) ? ' active' : ''}`}
            >
              <span className="hl-link-icon">{Icons[item.icon]}</span>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hl-right">
          <NotificationBell fetcher={getNotifications} role="AREA_MANAGER" />
          <div className="hl-avatar">{initials}</div>
          <div className="hl-user-info">
            <span className="hl-emp">{user?.employeeId}</span>
            <span className="hl-role">Area Manager</span>
          </div>
          <button className="hl-signout" onClick={logout}>
            {Icons.logout}<span>Sign Out</span>
          </button>
          <button className="hl-hamburger" onClick={() => setMobileOpen(o => !o)}>
            {mobileOpen ? Icons.close : Icons.menu}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <>
          <div className="hl-overlay" onClick={() => setMobileOpen(false)} />
          <div className="hl-mobile-menu am-mobile-menu">
            <div className="hl-mob-user">
              <div className="hl-mob-user-avatar">{initials}</div>
              <div>
                <div className="hl-mob-user-name">{user?.name || user?.employeeId}</div>
                <div className="hl-mob-user-role">Area Manager</div>
              </div>
            </div>
            {NAV.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`hl-mob-link${isActive(item.to) ? ' active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="hl-mob-icon">{Icons[item.icon]}</span>
                {item.label}
              </Link>
            ))}
            <div className="hl-mob-sep" />
            <button className="hl-mob-logout" onClick={logout}>{Icons.logout} Sign Out</button>
          </div>
        </>
      )}

      <main className="hl-content">
        {children}
        <div className="dev-credit"><span>Developed by Sumant Yadav</span></div>
      </main>
    </div>
  );
}
