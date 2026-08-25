import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../api/authApi';

const IcoLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IcoClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function ChangePasswordModal({ isOpen, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [saving, setSaving]       = useState(false);

  if (!isOpen) return null;

  function resetForm() {
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setError('');
    setSuccess('');
    setSaving(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (newPw !== confirmPw) {
      setError(t('auth.passwordsMismatch'));
      return;
    }
    if (newPw === currentPw) {
      setError(t('auth.passwordSameAsOld'));
      return;
    }
    if (newPw.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPw.length > 128) {
      setError('Password must be 128 characters or fewer');
      return;
    }
    if (!/[A-Z]/.test(newPw)) {
      setError('Password must include at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(newPw)) {
      setError('Password must include at least one lowercase letter');
      return;
    }
    if (!/[0-9]/.test(newPw)) {
      setError('Password must include at least one number');
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPw, newPw);
      setSuccess('Password changed successfully!');
      setTimeout(() => {
        handleClose();
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      console.error('Change password:', err);
      const code = err?.response?.status;
      setError(
        err.response?.data?.error ||
        (code === 401 ? 'The current password you entered is incorrect' :
         code === 400 ? 'Please check your password requirements' :
         'Could not change password. Please try again')
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div 
        className="modal-overlay" 
        onClick={handleClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Modal */}
      <div 
        className="change-password-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          animation: 'slideUp 0.3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(220,38,38,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--red)',
            }}>
              <IcoLock />
            </div>
            <div>
              <h3 style={{ 
                fontSize: '18px', 
                fontWeight: 800, 
                color: 'var(--t1)', 
                marginBottom: '2px',
              }}>
                {t('auth.changePassword')}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--t3)' }}>
                Update your account password
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--t3)',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
              e.currentTarget.style.color = 'var(--t1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--t3)';
            }}
          >
            <IcoClose />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '16px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" style={{ marginBottom: '16px', fontSize: '13px' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="modal-current-pw">{t('auth.currentPassword')}</label>
              <input
                id="modal-current-pw"
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                disabled={saving}
                autoComplete="current-password"
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="modal-new-pw">{t('auth.newPassword')}</label>
              <input
                id="modal-new-pw"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                disabled={saving}
                autoComplete="new-password"
                style={{ width: '100%' }}
              />
              <small style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '4px', display: 'block' }}>
                {t('auth.passwordHint')}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="modal-confirm-pw">{t('auth.confirmPassword')}</label>
              <input
                id="modal-confirm-pw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                disabled={saving}
                autoComplete="new-password"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '10px',
              marginTop: '24px',
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={saving}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{ flex: 1 }}
              >
                {saving ? t('auth.changingPassword') : t('auth.changePassword')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to { 
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>
    </>
  );
}
