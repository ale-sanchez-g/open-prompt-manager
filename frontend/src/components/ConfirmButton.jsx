import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle } from 'lucide-react';

/**
 * ConfirmButton — an inline, in-place confirmation control.
 *
 * Replaces the browser-native `window.confirm` dialog (which is invisible to
 * React, unstyled, inaccessible, and unreliable in some browsers/automation
 * contexts) with an accessible React element that confirms *in place* — no
 * popup, no modal, no overlay.
 *
 * Idle state renders a single trigger button. Clicking it swaps the same slot
 * for a "Cancel / Confirm" pair. `Escape` or clicking outside cancels; clicking
 * Confirm runs `onConfirm` (awaiting it if it returns a promise) while showing a
 * busy label. Focus moves to the Confirm button when confirmation opens, and the
 * prompt is announced via an `aria-live` region for screen-reader users.
 *
 * This is the project's first shared UI primitive — adopt it everywhere a
 * destructive action currently calls `window.confirm`.
 */
export default function ConfirmButton({
  onConfirm,
  idleLabel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busyLabel = 'Working…',
  promptLabel,
  icon = null,
  variant = 'default',
  className,
  title,
  ariaLabel,
  disabled = false,
  testId,
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef(null);
  const confirmRef = useRef(null);

  // Stop clicks from bubbling to clickable ancestors (e.g. a list row that
  // navigates on click) so opening/confirming/cancelling never triggers them.
  const stop = (e) => e.stopPropagation();

  // Move focus to the Confirm button as soon as the prompt opens.
  useEffect(() => {
    if (confirming && confirmRef.current) confirmRef.current.focus();
  }, [confirming]);

  // Escape key and outside-click both cancel the pending confirmation.
  useEffect(() => {
    if (!confirming) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setConfirming(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [confirming]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      // On success the caller typically navigates/unmounts; only reset state if
      // we are still mounted (best-effort — guarded by the ref check).
      if (containerRef.current) setConfirming(false);
    } finally {
      if (containerRef.current) setBusy(false);
    }
  };

  const dangerIdle = 'bg-red-700 hover:bg-red-600 text-white';
  const defaultIdle = 'bg-gray-700 hover:bg-gray-600 text-white';
  const idleClasses =
    className ||
    `flex items-center gap-1 text-sm px-3 py-2 rounded-lg transition-colors ${
      variant === 'danger' ? dangerIdle : defaultIdle
    }`;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setConfirming(true); }}
        disabled={disabled}
        className={idleClasses}
        title={title}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {icon}
        {idleLabel}
      </button>
    );
  }

  const isDanger = variant === 'danger';

  // The confirming state is a visually distinct inline group (not a popup or
  // modal). Both options are unambiguous, fully-labelled buttons — never an
  // icon-only or toggle-like control — so the destructive choice never relies
  // on colour alone (≈4.5% of users are colour-blind).
  const containerClasses = isDanger
    ? 'border border-red-500/50 bg-red-950/40'
    : 'border border-gray-600 bg-gray-800';
  const promptClasses = isDanger ? 'text-red-100' : 'text-gray-200';
  const confirmClasses = isDanger
    ? 'bg-red-600 hover:bg-red-500 focus:ring-red-400 text-white'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-400 text-white';

  return (
    // A native <fieldset> groups the prompt and its actions — its implicit ARIA
    // role is "group", so we get the grouping semantics without adding an
    // explicit role="group" to a <div>. Default fieldset chrome (border, margin,
    // min-inline-size) is reset so the container styling below applies cleanly.
    <fieldset
      ref={containerRef}
      aria-label={promptLabel}
      onClick={stop}
      className={`m-0 inline-flex min-w-0 items-center gap-3 rounded-lg py-1.5 pl-3 pr-2 ${containerClasses}`}
    >
      <span
        className={`flex items-center gap-1.5 text-sm font-medium ${promptClasses}`}
        aria-live="polite"
      >
        {isDanger && <AlertTriangle size={15} className="text-red-400 shrink-0" aria-hidden="true" />}
        {promptLabel}
      </span>
      <div className="flex items-center gap-2">
        {/* Safe exit first, clearly styled as a button (not a toggle). */}
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="text-sm font-medium border border-gray-500 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          data-testid={testId ? `${testId}-cancel` : undefined}
        >
          {cancelLabel}
        </button>
        {/* Destructive action names what it does — never a bare "Confirm". */}
        <button
          type="button"
          ref={confirmRef}
          onClick={handleConfirm}
          disabled={busy}
          className={`flex items-center gap-1.5 text-sm font-medium disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 ${confirmClasses}`}
          data-testid={testId ? `${testId}-confirm` : undefined}
        >
          {icon}
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </fieldset>
  );
}

ConfirmButton.propTypes = {
  /** Called when the user confirms. May return a promise; a busy label shows while it settles. */
  onConfirm: PropTypes.func.isRequired,
  /** Text on the initial trigger button. Omit for an icon-only trigger (provide `ariaLabel`). */
  idleLabel: PropTypes.node,
  /** Text on the confirm button once revealed. */
  confirmLabel: PropTypes.node,
  /** Text on the cancel button once revealed. */
  cancelLabel: PropTypes.node,
  /** Text shown on the confirm button while `onConfirm` is pending. */
  busyLabel: PropTypes.node,
  /** Short question announced to screen readers and shown inline (e.g. "Delete this prompt?"). */
  promptLabel: PropTypes.node.isRequired,
  /** Optional leading icon element (e.g. a lucide-react icon). */
  icon: PropTypes.node,
  /** Visual style of the action; "danger" for destructive operations. */
  variant: PropTypes.oneOf(['default', 'danger']),
  /** Override the idle button classes entirely (otherwise variant styling is used). */
  className: PropTypes.string,
  /** Tooltip / accessible title for the idle button. */
  title: PropTypes.string,
  /** Accessible name for the idle trigger — required when `idleLabel` is omitted (icon-only). */
  ariaLabel: PropTypes.string,
  /** Disables the idle trigger so confirmation cannot be started. */
  disabled: PropTypes.bool,
  /** Base test id; "-cancel"/"-confirm" suffixes are applied to the revealed buttons. */
  testId: PropTypes.string,
};
