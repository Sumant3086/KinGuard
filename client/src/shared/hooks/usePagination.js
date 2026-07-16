import { useState, useCallback } from 'react';

/**
 * Manages pagination state and provides helpers for updating it.
 *
 * @param {object} opts
 * @param {number} opts.initialPage  - Starting page (default 1)
 * @param {number} opts.pageSize     - Records per page (default 50)
 */
export function usePagination({ initialPage = 1, pageSize = 50 } = {}) {
  const [pagination, setPagination] = useState({
    page:         initialPage,
    pageSize,
    totalRecords: 0,
    totalPages:   0,
  });

  /** Jump to a specific page without changing other fields. */
  const setPage = useCallback(page => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  /** Sync pagination fields returned by the API — merges so local pageSize is never lost. */
  const updateFromResponse = useCallback(response => {
    setPagination(prev => ({ ...prev, ...response }));
  }, []);

  /** Reset to the first page. */
  const reset = useCallback(() => {
    setPagination(prev => ({ ...prev, page: initialPage }));
  }, [initialPage]);

  return { pagination, setPage, updateFromResponse, reset };
}
