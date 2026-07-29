import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/index.js';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

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

// Register service worker only in production.
// In development, the SW conflicts with Vite's HMR and causes FetchEvent errors.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[sw] Registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
