import { useState, useEffect, useRef } from 'react';
import { subscribeProgress } from '../../api/progress';

/**
 * Fixed 3px progress bar at the very top of the viewport (nprogress-style).
 * Driven automatically by the axios client via the shared progress bus.
 *
 * Anti-flicker rules:
 *  - only becomes visible if activity lasts longer than 120ms
 *  - stays visible for a short grace period after the last request finishes,
 *    so back-to-back requests read as one continuous sweep
 */
export default function TopProgress() {
  const [visible, setVisible] = useState(false);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => {
    const unsub = subscribeProgress(active => {
      if (active) {
        clearTimeout(hideTimer.current);
        clearTimeout(showTimer.current);
        showTimer.current = setTimeout(() => setVisible(true), 120);
      } else {
        clearTimeout(showTimer.current);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setVisible(false), 250);
      }
    });
    return () => {
      unsub();
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div className={`top-progress${visible ? ' show' : ''}`} aria-hidden="true">
      <div className="top-progress-bar" />
    </div>
  );
}
