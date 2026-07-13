import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import logoImg from '../../../assets/img/logo 32px32px.png';
import NotificationBell from '../../../shared/components/NotificationBell';
import { getNotifications } from '../../../shared/api/storeApi';

const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="2"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

export default function StoreLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isActive = path => location.pathname === path;

  return (
    <div className="store-shell">
      <header className="store-header">
        <div className="store-header-inner">
          <div className="store-brand">
            <img src={logoImg} alt="KinMarché" className="store-logo-img" />
            <span className="store-brand-name">KinMarché</span>
            {user?.store && (
              <span className="store-chip">{user.store.storeName}</span>
            )}
          </div>

          <nav className="store-nav-desktop">
            <Link to="/store/dashboard" className={`store-nav-link ${isActive('/store/dashboard') ? 'active' : ''}`}>
              Store Dashboard
            </Link>
            <Link to="/store/inventory" className={`store-nav-link ${isActive('/store/inventory') ? 'active' : ''}`}>
              Inventory Count
            </Link>
            <span className="store-nav-user">{user?.name}</span>
            <NotificationBell fetcher={getNotifications} role="STORE_MANAGER" />
            <button className="btn-signout" onClick={logout}>Sign Out</button>
          </nav>
        </div>
      </header>

      <div className="store-content">
        {children}
        <div className="dev-credit-store">
          <span>Developed by Sumant Yadav</span>
        </div>
      </div>

      <nav className="store-bottom-nav">
        <div className="store-bottom-nav-inner">
          <Link to="/store/dashboard" className={`mob-nav-item ${isActive('/store/dashboard') ? 'active' : ''}`}>
            {Icons.dashboard}
            Dashboard
          </Link>
          <Link to="/store/inventory" className={`mob-nav-item ${isActive('/store/inventory') ? 'active' : ''}`}>
            {Icons.inventory}
            Inventory Count
          </Link>
          <button className="mob-logout" onClick={logout}>
            {Icons.logout}
            Sign Out
          </button>
        </div>
      </nav>
    </div>
  );
}
