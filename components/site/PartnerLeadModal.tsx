'use client';

import { useState, type FormEvent } from 'react';
import type { PartnerRoleRequested } from '@/lib/types/partnerRequest';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export function PartnerLeadModal({ onClose }: { onClose: () => void }) {
  const [roleRequested, setRoleRequested] = useState<PartnerRoleRequested>('coffee_shop');
  const [companyName, setCompanyName] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = companyName.trim() && contactName.trim() && email.trim();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/partner-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_requested: roleRequested,
          company_name: companyName,
          city,
          contact_name: contactName,
          email,
          phone,
          comment,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Не удалось отправить заявку. Попробуйте ещё раз.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Не удалось отправить заявку — проверьте соединение и попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Стать партнёром"
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="font-display text-xl text-ink-900">Стать партнёром</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0"
          >
            ×
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-3" aria-hidden="true">
              ✓
            </p>
            <p className="font-display text-lg text-ink-900 mb-2">Заявка принята!</p>
            <p className="text-sm text-ink-500 max-w-xs mx-auto">
              Наш менеджер свяжется с вами для заключения договора.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <span className="block text-xs text-ink-400 mb-2">Кто вы?</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'coffee_shop', label: 'Кофейня' },
                    { id: 'roaster', label: 'Обжарщик' },
                  ] as const
                ).map((option) => {
                  const checked = roleRequested === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex items-center justify-center rounded-md border px-3 py-3
                                  text-sm cursor-pointer transition-colors
                                  ${checked
                                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
                    >
                      <input
                        type="radio"
                        name="role_requested"
                        value={option.id}
                        checked={checked}
                        onChange={() => setRoleRequested(option.id)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="lead-company" className="block text-xs text-ink-400 mb-1.5">
                Название компании
              </label>
              <input
                id="lead-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="XO Coffee"
                required
                className={fieldClasses}
              />
            </div>

            <div>
              <label htmlFor="lead-city" className="block text-xs text-ink-400 mb-1.5">
                Город
              </label>
              <input
                id="lead-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Санкт-Петербург"
                className={fieldClasses}
              />
            </div>

            <div>
              <label htmlFor="lead-name" className="block text-xs text-ink-400 mb-1.5">
                ФИО
              </label>
              <input
                id="lead-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Иван Иванов"
                required
                className={fieldClasses}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lead-email" className="block text-xs text-ink-400 mb-1.5">
                  Email
                </label>
                <input
                  id="lead-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className={fieldClasses}
                />
              </div>
              <div>
                <label htmlFor="lead-phone" className="block text-xs text-ink-400 mb-1.5">
                  Телефон
                </label>
                <input
                  id="lead-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 900 000-00-00"
                  className={fieldClasses}
                />
              </div>
            </div>

            <div>
              <label htmlFor="lead-comment" className="block text-xs text-ink-400 mb-1.5">
                Комментарий
              </label>
              <textarea
                id="lead-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Сколько точек, что интересует…"
                className={fieldClasses}
              />
            </div>

            {error && <p className="text-xs text-ink-500">⚠ {error}</p>}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-sm px-6 py-4
                         hover:bg-ink-800 transition-colors
                         disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? 'Отправляем…' : 'Отправить заявку'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
