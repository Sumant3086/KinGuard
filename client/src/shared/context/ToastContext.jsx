import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter  = useRef(0);
  const timers   = useRef(new Set());

  // Clear all pending timers on unmount to prevent state updates on unmounted component
  useEffect(() => {
    const activeTimers = timers.current;
    return () => { activeTimers.forEach(clearTimeout); };
  }, []);

  const push = useCallback((message, type, duration) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    const t1 = setTimeout(() => {
      timers.current.delete(t1);
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      const t2 = setTimeout(() => {
        timers.current.delete(t2);
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 150);
      timers.current.add(t2);
    }, duration);
    timers.current.add(t1);
  }, []);

  function dismiss(id) {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    const t = setTimeout(() => {
      timers.current.delete(t);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 150);
    timers.current.add(t);
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
            <div 
              key={t.id} 
              className={`toast toast-${t.type}${t.exiting ? ' toast-exit' : ''}`} 
              role="alert"
              style={{ '--toast-duration': `${t.duration}ms` }}
            >
              <div className="toast-icon">
                {t.type === 'success' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>}
                {t.type === 'error'   && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                {t.type === 'warning' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                {t.type === 'info'    && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              </div>
              <span className="toast-msg">{t.message}</span>
              <button 
                className="toast-x" 
                onClick={() => dismiss(t.id)} 
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
