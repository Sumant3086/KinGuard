import { useState, useCallback } from 'react';

/**
 * Boolean toggle with stable on/off/toggle callbacks.
 *
 * @returns {[boolean, { toggle: fn, on: fn, off: fn }]}
 */
export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  const on     = useCallback(() => setValue(true), []);
  const off    = useCallback(() => setValue(false), []);
  return [value, { toggle, on, off }];
}
