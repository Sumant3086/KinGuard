import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';

/**
 * Generic hook for async API calls with loading / error / data state.
 * State updates are suppressed after the component unmounts.
 *
 * Usage:
 *   const { data, loading, error, execute } = useApiRequest();
 *   useEffect(() => { execute(api.getStores); }, []); // eslint-disable-line
 *
 *   // With arguments:
 *   await execute(api.updateStore, id, payload);
 *
 * @param {object}  opts
 * @param {boolean} opts.showErrorToast  - Toast on error (default true)
 * @param {*}       opts.initialData     - Initial data value (default null)
 */
export function useApiRequest({ showErrorToast = true, initialData = null } = {}) {
  const toast = useToast();
  const [data,    setData]    = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (apiFn, ...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFn(...args);
      if (!mountedRef.current) return null;
      setData(result);
      return result;
    } catch (err) {
      if (!mountedRef.current) return null;
      console.error('API request failed:', err.response?.data?.error ?? err.message ?? err);
      const message = 'Something went wrong. Please try again.';
      setError(message);
      if (showErrorToast) toast.error(message);
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [toast, showErrorToast]);

  return { data, loading, error, execute, setData };
}
