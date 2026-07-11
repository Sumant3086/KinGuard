/**
 * Extract a human-readable message from any thrown value.
 *
 * Priority:
 *   1. Server JSON body   → err.response.data.error
 *   2. Axios/JS message   → err.message
 *   3. Caller fallback
 */
export function extractError(err, fallback = 'An unexpected error occurred') {
  return err?.response?.data?.error ?? err?.message ?? fallback;
}
