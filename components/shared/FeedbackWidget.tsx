'use client';

import { useState } from 'react';
import type { PlatformFeedbackType, ProfileRole } from '@/lib/types/database';
import { submitPlatformFeedback } from '@/lib/data/platformFeedback';

const FEEDBACK_TYPES: { id: PlatformFeedbackType; label: string }[] = [
  { id: 'bug', label: 'Ошибка в работе' },
  { id: 'ui', label: 'Пожелание по UI/сервису' },
  { id: 'idea', label: 'Идея' },
];

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Floating "Обратная связь" button + a compact modal — mounted once per
// role via a thin wrapper that resolves userId/role from that role's own
// session source (see components/shared/EnthusiastFeedbackWidget.tsx for
// the anonymous-capable consumer flow, components/shared/StaffFeedbackWidget.tsx
// for the three staff dashboards). Writes to public.platform_feedback (see
// supabase/migrations/0009_platform_feedback.sql) — insert-only from here,
// readable only by an admin, so this never reads back past submissions.
export function FeedbackWidget({
  userId,
  role,
  isAuthenticated,
}: {
  userId: string | null;
  role: ProfileRole;
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PlatformFeedbackType>('idea');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'sent' | 'error' | null>(null);

  function reset() {
    setType('idea');
    setMessage('');
    setResult(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    if (!isAuthenticated || !userId || !message.trim()) return;
    setSubmitting(true);
    const outcome = await submitPlatformFeedback({
      userId,
      userRole: role,
      feedbackType: type,
      message: message.trim(),
    });
    setSubmitting(false);
    setResult(outcome.ok ? 'sent' : 'error');
    if (outcome.ok) setMessage('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Обратная связь"
        // Bottom-right, clear of DevRoleSwitcher's bottom-center panel and
        // any bottom-left placement a scroll-to-top control might use.
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40
                   inline-flex items-center gap-2 rounded-full border border-ink-200
                   bg-parchment-100/95 backdrop-blur-sm px-4 py-3 text-xs font-body font-medium
                   text-ink-700 shadow-[0_8px_20px_-8px_rgba(26,20,16,0.35)]
                   hover:bg-parchment-300 transition-colors"
      >
        <span aria-hidden="true">💬</span>
        <span className="hidden sm:inline">Обратная связь</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Обратная связь"
            onClick={(event) => event.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                       bg-parchment-100 p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <h2 className="font-display text-xl text-ink-900">Обратная связь</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть"
                className="text-ink-400 text-2xl leading-none px-1 shrink-0"
              >
                ×
              </button>
            </div>

            {result === 'sent' ? (
              <div className="text-center py-4">
                <p className="text-3xl mb-3" aria-hidden="true">
                  ✓
                </p>
                <p className="font-display text-lg text-ink-900 mb-2">Спасибо!</p>
                <p className="text-sm text-ink-500 mb-5">Сообщение отправлено команде платформы.</p>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex items-center justify-center rounded-md bg-ink-900
                             text-parchment-100 font-body font-medium text-sm px-6 py-3
                             hover:bg-ink-800 transition-colors"
                >
                  Готово
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div role="radiogroup" aria-label="Тип обращения" className="flex flex-col gap-2">
                  {FEEDBACK_TYPES.map((option) => {
                    const checked = type === option.id;
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors
                                    ${checked ? 'border-gold-400 bg-gold-400/10' : 'border-ink-200 bg-parchment-100'}`}
                      >
                        <input
                          type="radio"
                          name="feedback-type"
                          checked={checked}
                          onChange={() => setType(option.id)}
                          className="h-4 w-4 accent-current text-gold-500"
                        />
                        <span className="text-sm text-ink-900">{option.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label htmlFor="feedback-message" className="block text-xs text-ink-400 mb-1.5">
                    Сообщение
                  </label>
                  <textarea
                    id="feedback-message"
                    rows={4}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Расскажите, что случилось или что бы вы хотели изменить…"
                    className={fieldClasses}
                  />
                </div>

                {!isAuthenticated && (
                  <p className="text-xs text-ink-400">
                    Войдите в аккаунт, чтобы отправить сообщение.
                  </p>
                )}
                {result === 'error' && (
                  <p className="text-xs text-rating">Не удалось отправить — попробуйте ещё раз.</p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isAuthenticated || !message.trim() || submitting}
                  className="inline-flex items-center justify-center rounded-md bg-ink-900
                             text-parchment-100 font-body font-medium text-sm px-6 py-4
                             hover:bg-ink-800 transition-colors
                             disabled:opacity-40 disabled:pointer-events-none"
                >
                  {submitting ? 'Отправка…' : 'Отправить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
