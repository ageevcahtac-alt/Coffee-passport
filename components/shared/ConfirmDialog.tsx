'use client';

import { useEffect, type ReactNode } from 'react';

// In-app confirmation (never the browser's native confirm()) — same bottom
// sheet on mobile / centered card on desktop as ActivatePartnerModal and the
// other modals in the app. While `busy`, the confirm button is disabled and
// the dialog can't be dismissed, so one click = one request.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  error = null,
  confirmDisabled = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-display text-xl text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0 disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {children ? <div className="text-sm text-ink-600 flex flex-col gap-3 mb-5">{children}</div> : null}

        {error ? (
          <p role="alert" className="text-sm text-red-600 mb-4">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-md border border-ink-200 px-5 py-3
                       text-sm font-body text-ink-700 hover:border-ink-400 transition-colors disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className="inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100
                       font-body font-medium text-sm px-5 py-3 hover:bg-ink-800 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Отправка…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
