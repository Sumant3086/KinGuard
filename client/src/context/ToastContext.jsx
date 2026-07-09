import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const push = useCallback((message, type, duration) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  function dismiss(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  const toast = {
    success: (msg, dur = 4000)  => push(msg, 'success', dur),
    error:   (msg, dur = 6000)  => push(msg, 'error',   dur),
    warning: (msg, dur = 4500)  => push(msg, 'warning', dur),
    info:    (msg, dur = 4000)  => push(msg, 'info',    dur),
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite" aria-label="Notifications">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`} role="alert">
              <div className="toast-icon">
                {t.type === 'success' && '✓'}
                {t.type === 'error'   && '✕'}
                {t.type === 'warning' && '⚠'}
                {t.type === 'info'    && 'ℹ'}
              </div>
              <span className="toast-msg">{t.message}</span>
              <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
