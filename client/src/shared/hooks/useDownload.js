import { useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { downloadBlob } from '../utils/downloadBlob';

/**
 * Handles file download with a loading flag and error toast.
 *
 * Usage:
 *   const { downloading, download } = useDownload();
 *   await download(api.downloadExport, 'report.xlsx', filters);
 *
 * The third+ arguments are forwarded to the API function:
 *   download(apiFn, filename, ...apiArgs)
 */
export function useDownload() {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(async (apiFn, filename, ...args) => {
    setDownloading(true);
    try {
      const blob = await apiFn(...args);
      downloadBlob(blob, filename);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [toast]);

  return { downloading, download };
}
