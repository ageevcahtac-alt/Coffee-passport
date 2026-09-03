'use client';

import { useEffect, useState } from 'react';
import type { CoffeeEvent, EventStatus } from '@/lib/types/coffee';
import {
  deleteEvent,
  fetchAllEvents,
  saveEvent,
  setEventStatus,
  type EventFormValues,
} from '@/lib/data/events';
import { formatDate } from '@/lib/utils/date';
import { EventForm } from '@/components/admin/EventForm';

const TABS: { id: EventStatus; label: string }[] = [
  { id: 'active', label: 'Активные' },
  { id: 'pending_review', label: 'На модерации' },
  { id: 'archived', label: 'Архив' },
];

// Events moderation — the three sections the task asked for are a client-
// side filter over one fetchAllEvents() list (same table, different
// status), not three separate routes: "Активные" (live on the public
// board), "На модерации" (aggregator candidates awaiting approval, see
// app/api/cron/events-aggregate), "Архив" (past events the daily cron
// already retired, see app/api/cron/events-archive) — plus manual
// add/edit via EventForm.
export default function AdminEventsPage() {
  const [events, setEvents] = useState<CoffeeEvent[] | null>(null);
  const [tab, setTab] = useState<EventStatus>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CoffeeEvent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setEvents(await fetchAllEvents());
  }

  useEffect(() => {
    void reload();
  }, []);

  const shown = (events ?? []).filter((event) => event.status === tab);
  const pendingCount = (events ?? []).filter((event) => event.status === 'pending_review').length;

  async function handleSave(values: EventFormValues) {
    await saveEvent(editing ? { ...values, id: editing.id } : values);
    setFormOpen(false);
    setEditing(null);
    await reload();
  }

  async function handleStatusChange(id: string, status: EventStatus) {
    setBusyId(id);
    await setEventStatus(id, status);
    await reload();
    setBusyId(null);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    await deleteEvent(id);
    await reload();
    setBusyId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="section-label flex-1">Мероприятия</p>
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="shrink-0 rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-2.5
                       hover:bg-ink-800 transition-colors"
          >
            + Добавить
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mb-8 reveal-fade">
          <EventForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        </div>
      )}

      <div role="tablist" className="flex gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              tab === t.id ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium' : 'border-ink-200 text-ink-500'
            }`}
          >
            {t.label}
            {t.id === 'pending_review' && pendingCount > 0 && ` (${pendingCount})`}
          </button>
        ))}
      </div>

      {events === null ? (
        <p className="text-sm text-ink-400">Загрузка…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-400">
          {tab === 'pending_review'
            ? 'Агрегатор пока ничего не нашёл — см. app/api/cron/events-aggregate.'
            : 'Здесь пока пусто.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((event) => (
            <div key={event.id} className="rounded-md border border-ink-200 bg-parchment-100 p-5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h3 className="font-display text-lg text-ink-900 leading-tight">{event.title}</h3>
                  <p className="text-xs text-ink-400 mt-1">
                    {formatDate(event.startDate)} — {formatDate(event.endDate)}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                {event.source !== 'manual' && (
                  <span className="text-[10px] uppercase tracking-widest2 text-ink-300 shrink-0">
                    {event.source}
                  </span>
                )}
              </div>

              {event.description && <p className="text-sm text-ink-700 mb-3">{event.description}</p>}
              {event.link && (
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 block mb-3"
                >
                  {event.link}
                </a>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-ink-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(event);
                    setFormOpen(true);
                  }}
                  disabled={busyId === event.id}
                  className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
                >
                  Редактировать
                </button>

                {event.status === 'pending_review' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(event.id, 'active')}
                    disabled={busyId === event.id}
                    className="text-moss-700 underline underline-offset-2 hover:text-ink-900"
                  >
                    Одобрить
                  </button>
                )}
                {event.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(event.id, 'archived')}
                    disabled={busyId === event.id}
                    className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
                  >
                    В архив
                  </button>
                )}
                {event.status === 'archived' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(event.id, 'active')}
                    disabled={busyId === event.id}
                    className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
                  >
                    Вернуть в активные
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(event.id)}
                  disabled={busyId === event.id}
                  className="text-ink-500 underline underline-offset-2 hover:text-ink-900 ml-auto"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
