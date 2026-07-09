import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url    = error.config?.url ?? '';
    // 401 always means invalid/expired token — clear and redirect.
    // 503 only clears the session when it came from an auth endpoint
    // (DB down during token validation). A 503 on a report or upload
    // endpoint is a transient outage and must NOT log the user out.
    const isAuthEndpoint = url.includes('/auth/');
    if (status === 401 || (status === 503 && isAuthEndpoint)) {
      localStorage.removeItem('token');
      localStorage.removeItem('kg_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
