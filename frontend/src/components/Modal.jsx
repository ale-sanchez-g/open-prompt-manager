import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

/**
 * Modal — an accessible overlay dialog.
 *
 * Renders a centered panel over a dimmed backdrop with a header (title + close
 * button) and arbitrary children. Closes on the × button or `Escape`; focus is
 * moved into the dialog on open. Uses a native <dialog> element (with aria-modal)
 * so assistive tech treats it as a modal surface across all devices.
 *
 * Unlike the inline ConfirmButton, this is for richer content (e.g. a version
 * diff) that genuinely warrants an overlay.
 */
export default function Modal({ onClose, title = null, ariaLabel, maxWidth = 'max-w-lg', children = null }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    if (panelRef.current) panelRef.current.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-auto">
      {/* Native <dialog> for built-in dialog semantics. Rendered open and
          centered by the flex backdrop above; the `static`/`p-0`/`mx-0` resets
          neutralize the user-agent dialog styles (absolute position, 1em
          padding, auto margins) so our own layout applies cleanly. */}
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`static block mx-0 p-0 bg-gray-900 rounded-xl border border-gray-700 w-full ${maxWidth} shadow-2xl mt-8 mb-8 focus:outline-none`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3 min-w-0">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}

Modal.propTypes = {
  /** Called when the user dismisses the modal (× button or Escape). */
  onClose: PropTypes.func.isRequired,
  /** Header content (left of the close button). */
  title: PropTypes.node,
  /** Accessible name for the dialog surface. */
  ariaLabel: PropTypes.string,
  /** Tailwind max-width class for the panel (e.g. "max-w-4xl"). */
  maxWidth: PropTypes.string,
  children: PropTypes.node,
};
