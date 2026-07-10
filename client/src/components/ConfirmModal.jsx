export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning' }) {
  if (!isOpen) return null;

  const iconMap = {
    warning: '⚠️',
    danger: '⚠️',
    info: 'ℹ️',
    success: '✓',
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>{iconMap[type]}</span>
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <button onClick={onClose} className="close-btn" aria-label="Close">&times;</button>
        </div>
        
        <div style={{ padding: '20px 0', fontSize: '14px', lineHeight: '1.6', color: 'var(--t2)' }}>
          {message}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
          <button 
            type="button" 
            className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
