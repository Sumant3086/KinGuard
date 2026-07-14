import axios from 'axios';
import { progressStart, progressDone } from './progress';

// Use environment variable or default to /api (proxy in dev, same-origin in prod)
const baseURL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL,
  withCredentials: true, // send HttpOnly cookies on every request
  timeout: 30000,        // 30 s default; file endpoints override per-request
});

// ── Global top progress bar ────────────────────────────────────────────────
// Every request ticks the shared progress counter; <TopProgress /> renders it.
// Registered BEFORE the 401-refresh interceptor so done() always fires exactly
// once per request — a 401 retry re-enters these interceptors and stays balanced.
client.interceptors.request.use(
  config => { progressStart(); return config; },
  error  => { progressDone(); return Promise.reject(error); }
);
client.interceptors.response.use(
  response => { progressDone(); return response; },
  error    => { progressDone(); return Promise.reject(error); }
);

// ── Token refresh state ────────────────────────────────────────────────────
let isRefreshing = false;
let refreshQueue = []; // { resolve, reject }

function drainQueue(error) {
  refreshQueue.forEach(p => (error ? p.reject(error) : p.resolve()));
  refreshQueue = [];
}

// ── Response interceptor — handle 401 with silent refresh ─────────────────
client.interceptors.response.use(
  response => response,
  async error => {
    const status  = error.response?.status;
    const url     = error.config?.url ?? '';
    const originalRequest = error.config;

    // Prevent refresh loops: bail if the failing request is the refresh endpoint
    if (status === 401 && !url.includes('/auth/refresh') && !originalRequest._retried) {
      if (isRefreshing) {
        // Another refresh is in flight — queue this request to retry after
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => client(originalRequest));
      }

      isRefreshing = true;
      originalRequest._retried = true;

      try {
        // Use the configured baseURL so this works in both dev and production
        await client.post('/auth/refresh', {}, { withCredentials: true });
        drainQueue(null);
        return client(originalRequest);
      } catch {
        drainQueue(new Error('Session expired'));
        // Only hard-redirect from protected routes — public pages handle it themselves
        const path = window.location.pathname;
        const isProtected = path.startsWith('/admin') ||
                            path.startsWith('/store') ||
                            path === '/change-password';
        if (isProtected) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default client;
