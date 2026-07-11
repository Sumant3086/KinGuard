import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  withCredentials: true, // send HttpOnly cookies on every request
});

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

    // Prevent refresh loops: if the failing request is already the refresh endpoint, bail out
    if (status === 401 && !url.includes('/auth/refresh') && !originalRequest._retried) {
      if (isRefreshing) {
        // Another refresh is already in flight — queue this request to retry after
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => client(originalRequest));
      }

      isRefreshing = true;
      originalRequest._retried = true;

      try {
        // POST to refresh endpoint — sends the refreshToken HttpOnly cookie automatically
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        drainQueue(null);
        return client(originalRequest); // retry original request with new access token cookie
      } catch {
        drainQueue(new Error('Session expired'));
        // Only hard-redirect to login from protected routes.
        // On public pages (/, /login, etc.) the AuthContext .catch() handler
        // already clears the user state — no redirect needed and doing one
        // would break refreshing on the home page.
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
