import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// In production, silence all browser console output so internal
// implementation details are never visible in DevTools to end users.
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log   = noop;
  console.warn  = noop;
  console.error = noop;
  console.debug = noop;
  console.info  = noop;
}
import './styles/tokens.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/inventory.css';
import './styles/pages.css';
import './styles/toast.css';
import './styles/utilities.css';
import { ToastProvider } from './shared/context/ToastContext';
import { AuthProvider } from './features/auth/AuthContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
