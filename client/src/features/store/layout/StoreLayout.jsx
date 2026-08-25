import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { setLanguage } from '../../../i18n/index.js';
import logoImg from '../../../assets/img/logo 32px32px.png';
import NotificationBell from '../../../shared/components/NotificationBell';
import ChangePasswordModal from '../../../shared/components/ChangePasswordModal';
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
  key: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
};

export default function StoreLayout({ children }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
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
              {t('nav.dashboard')}
            </Link>
            <Link to="/store/inventory" className={`store-nav-link ${isActive('/store/inventory') ? 'active' : ''}`}>
              {t('nav.inventory')}
            </Link>

            {/* Language switcher */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['en', 'fr'].map(lng => (
                <button
                  key={lng}
                  onClick={() => setLanguage(lng)}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
                    cursor: 'pointer', fontWeight: 600,
                    background: i18n.language === lng ? 'var(--red)' : 'transparent',
                    color: i18n.language === lng ? '#fff' : 'var(--tx3)',
                  }}
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowPasswordModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--t2)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
                e.currentTarget.style.borderColor = 'var(--red)';
                e.currentTarget.style.color = 'var(--red)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--t2)';
              }}
            >
              {Icons.key}
              <span>Change Password</span>
            </button>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>
              {user?.name}
            </div>
            <NotificationBell fetcher={getNotifications} role="STORE_MANAGER" userId={user?.id} />
            <button className="btn-signout" onClick={logout}>{t('nav.signOut')}</button>
          </nav>
        </div>
      </header>

      <div className="store-content">
        {children}
        <div className="dev-credit-store">
          <span>{t('common.developedBy')}</span>
        </div>
      </div>

      <nav className="store-bottom-nav">
        <div className="store-bottom-nav-inner">
          <Link to="/store/dashboard" className={`mob-nav-item ${isActive('/store/dashboard') ? 'active' : ''}`}>
            {Icons.dashboard}
            {t('nav.dashboard')}
          </Link>
          <Link to="/store/inventory" className={`mob-nav-item ${isActive('/store/inventory') ? 'active' : ''}`}>
            {Icons.inventory}
            {t('nav.inventory')}
          </Link>
          <button className="mob-logout" onClick={logout}>
            {Icons.logout}
            {t('nav.signOut')}
          </button>
        </div>
      </nav>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          // Optional: show a success toast/notification
        }}
      />
    </div>
  );
}
