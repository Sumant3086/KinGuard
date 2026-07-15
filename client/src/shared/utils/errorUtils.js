const IS_PROD = import.meta.env.PROD;

// In production always return a generic message so no internal details
// ever surface to users. In development return the real message for debugging.
export function extractError(err, fallback = 'Something went wrong. Please try again.') {
  if (IS_PROD) return fallback;
  return err?.response?.data?.error ?? err?.message ?? fallback;
}

// Safe version for toast calls — always user-friendly regardless of environment.
// Use this when showing errors in the UI; pass the raw err to console.error separately.
export function userMessage(err, fallback = 'Something went wrong. Please try again.') {
  return fallback;
}
