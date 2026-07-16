import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const IcoWarn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoInfo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IcoCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ICON_MAP = {
  warning: { icon: <IcoWarn />, color: 'var(--amber)' },
  danger:  { icon: <IcoWarn />, color: 'var(--red)' },
  info:    { icon: <IcoInfo />, color: 'var(--blue)' },
  success: { icon: <IcoCheck />, color: 'var(--green)' },
};

// Shared reference counter — same pattern as Modal.jsx so nested modals
// don't prematurely restore scroll when one closes while another is open.
let _openConfirmCount = 0;

export default function ConfirmModal({
  isOpen, onClose, onConfirm,
  title, message,
  confirmText = 'Confirm', cancelText = 'Cancel',
  type = 'warning',
}) {
  // Lock body scroll while open, release when closed or unmounted.
  useEffect(() => {
    if (!isOpen) return;
    _openConfirmCount++;
    document.body.style.overflow = 'hidden';
    return () => {
      _openConfirmCount--;
      if (_openConfirmCount === 0) document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const { icon, color } = ICON_MAP[type] ?? ICON_MAP.warning;

  return createPortal(
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color, display: 'flex' }}>{icon}</span>
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <button onClick={onClose} className="close-btn" aria-label="Close">&times;</button>
        </div>

        <div style={{ padding: '20px 0', fontSize: 14, lineHeight: 1.6, color: 'var(--t2)' }}>
          {message}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { try { onConfirm(); } finally { onClose(); } }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
