'use client';

import { useEffect, useState } from 'react';
import {
  PARTNER_REQUEST_STATUS_LABELS,
  PARTNER_REQUEST_STATUS_ORDER,
  type PartnerRequest,
  type PartnerRequestStatus,
} from '@/lib/types/partnerRequest';
import { ActivatePartnerModal } from './ActivatePartnerModal';

function nextStatus(status: PartnerRequestStatus): PartnerRequestStatus | null {
  const index = PARTNER_REQUEST_STATUS_ORDER.indexOf(status);
  return index >= 0 && index < PARTNER_REQUEST_STATUS_ORDER.length - 1
    ? PARTNER_REQUEST_STATUS_ORDER[index + 1]
    : null;
}

export function PartnerRequestsTab() {
  const [requests, setRequests] = useState<PartnerRequest[] | null>(null);
  const [error, setError] = useState('');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activateFor, setActivateFor] = useState<PartnerRequest | 'blank' | null>(null);

  async function load() {
    setError('');
    try {
      const response = await fetch('/api/admin/partner-requests');
      if (!response.ok) throw new Error('bad status');
      const data = await response.json();
      setRequests(data.requests as PartnerRequest[]);
    } catch {
      setError('Не удалось загрузить заявки. Проверьте, что таблица partner_requests существует в Supabase.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patchRequest(id: string, body: { status?: PartnerRequestStatus; manager_notes?: string }) {
    setSavingId(id);
    try {
      const response = await fetch(`/api/admin/partner-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('bad status');
      const data = await response.json();
      setRequests((prev) => prev?.map((r) => (r.id === id ? (data.request as PartnerRequest) : r)) ?? prev);
    } catch {
      setError('Не удалось сохранить изменения.');
    } finally {
      setSavingId(null);
    }
  }

  // The "+ Активировать партнёра" action is independent of whether the
  // leads list itself loaded — always reachable, even while Supabase's
  // partner_requests table doesn't exist yet (today's actual state until
  // the migration is applied) or a fetch failed for any other reason.
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-ink-500">
          {requests ? `${requests.length} заявок всего` : ' '}
        </p>
        <button
          type="button"
          onClick={() => setActivateFor('blank')}
          className="inline-flex items-center justify-center rounded-md bg-gold-500
                     text-parchment-100 font-body font-medium text-sm px-4 py-2.5
                     hover:bg-gold-400 transition-colors"
        >
          + Активировать партнёра
        </button>
      </div>

      {error && <p className="text-sm text-ink-500 mb-4">⚠ {error}</p>}
      {!error && !requests && <p className="text-sm text-ink-400 mb-4">Загрузка заявок…</p>}

      {requests && (requests.length === 0 ? (
        <p className="text-sm text-ink-400">Пока нет ни одной заявки.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((req) => {
            const draft = notesDraft[req.id] ?? req.manager_notes ?? '';
            const advance = nextStatus(req.status);
            return (
              <div key={req.id} className="rounded-md border border-ink-200 bg-parchment-100 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h3 className="font-display text-lg text-ink-900 leading-tight">
                      {req.company_name}
                    </h3>
                    <p className="text-xs text-ink-400 mt-1">
                      {req.role_requested === 'roaster' ? 'Обжарщик' : 'Кофейня'}
                      {req.city ? ` · ${req.city}` : ''}
                    </p>
                  </div>
                  <span
                    className="rounded-full border border-gold-400 text-gold-500 text-[11px]
                               uppercase tracking-widest2 px-2.5 py-1 shrink-0"
                  >
                    {PARTNER_REQUEST_STATUS_LABELS[req.status]}
                  </span>
                </div>

                <dl className="grid gap-1 text-sm mb-4">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-400">Контакт</dt>
                    <dd className="text-ink-900 text-right">{req.contact_name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-400">Email</dt>
                    <dd className="text-ink-900 text-right">{req.email}</dd>
                  </div>
                  {req.phone && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-400">Телефон</dt>
                      <dd className="text-ink-900 text-right">{req.phone}</dd>
                    </div>
                  )}
                </dl>

                {req.comment && (
                  <p className="text-sm text-ink-700 mb-4 border-l-2 border-ink-200 pl-3">
                    {req.comment}
                  </p>
                )}

                <label htmlFor={`notes-${req.id}`} className="block text-xs text-ink-400 mb-1.5">
                  Заметки менеджера
                </label>
                <textarea
                  id={`notes-${req.id}`}
                  rows={2}
                  value={draft}
                  onChange={(e) => setNotesDraft((prev) => ({ ...prev, [req.id]: e.target.value }))}
                  onBlur={() => {
                    if (draft !== (req.manager_notes ?? '')) patchRequest(req.id, { manager_notes: draft });
                  }}
                  placeholder="Договорились на звонок вторник, 15:00…"
                  className="w-full rounded-md border border-ink-200 bg-parchment-200 px-3 py-2
                             text-sm text-ink-900 placeholder:text-ink-300 focus:border-gold-400 mb-4"
                />

                <div className="flex flex-wrap gap-3">
                  {advance && (
                    <button
                      type="button"
                      disabled={savingId === req.id}
                      onClick={() => patchRequest(req.id, { status: advance })}
                      className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900
                                 disabled:opacity-40"
                    >
                      Перевести в «{PARTNER_REQUEST_STATUS_LABELS[advance]}»
                    </button>
                  )}
                  {req.status !== 'activated' && (
                    <button
                      type="button"
                      onClick={() => setActivateFor(req)}
                      className="text-sm text-gold-500 underline underline-offset-2 hover:text-gold-600"
                    >
                      Активировать
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {activateFor && (
        <ActivatePartnerModal
          initialCompanyName={activateFor === 'blank' ? '' : activateFor.company_name}
          initialCity={activateFor === 'blank' ? '' : activateFor.city ?? ''}
          initialRole={activateFor === 'blank' ? 'coffee_shop' : activateFor.role_requested}
          onClose={() => setActivateFor(null)}
          onActivated={() => {
            if (activateFor !== 'blank') {
              patchRequest(activateFor.id, { status: 'activated' });
            }
          }}
        />
      )}
    </div>
  );
}
