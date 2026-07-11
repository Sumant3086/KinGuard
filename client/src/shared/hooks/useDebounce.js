import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates
 * after `delay` ms of silence.
 */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
