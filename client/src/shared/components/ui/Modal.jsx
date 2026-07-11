import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Reference-counted overflow lock: body scroll is only restored once ALL open modals unmount.
let _openModalCount = 0;

/**
 * Renders children into document.body via React Portal.
 * This escapes any ancestor transform/stacking-context that would break
 * position:fixed — the industry-standard pattern for modals.
 */
export default function Modal({ children, onClose, style }) {
  useEffect(() => {
    _openModalCount++;
    document.body.style.overflow = 'hidden';
    return () => {
      _openModalCount--;
      if (_openModalCount === 0) document.body.style.overflow = '';
    };
  }, []);

  return createPortal(
    <div className="modal" style={style} onClick={onClose}>
      {children}
    </div>,
    document.body
  );
}
