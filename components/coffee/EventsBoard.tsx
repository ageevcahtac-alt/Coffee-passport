'use client';

import useSWR from 'swr';
import { formatDate } from '@/lib/utils/date';
import type { CoffeeEvent } from '@/lib/types/coffee';

const EVENTS_LIMIT = 5;

async function fetcher(url: string): Promise<{ events: CoffeeEvent[] }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load events: HTTP ${response.status}`);
  return response.json();
}

function formatEventDates(event: CoffeeEvent): string {
  if (event.startDate === event.endDate) return formatDate(event.startDate);
  return `${formatDate(event.startDate)} — ${formatDate(event.endDate)}`;
}

function EventCardSkeleton() {
  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5 animate-pulse">
      <div className="h-3 w-24 bg-parchment-300 rounded mb-3" />
      <div className="h-5 w-3/4 bg-parchment-300 rounded mb-2" />
      <div className="h-3 w-1/2 bg-parchment-300 rounded mb-3" />
      <div className="h-3 w-full bg-parchment-300 rounded" />
    </div>
  );
}

// fullHeight (default true) fits the isolated /map tab, which needs its own
// scroll region inside a fixed-height flex parent. Embedding this inline in
// a normal document-flow page (e.g. /journey) passes fullHeight={false} so
// it renders as plain block content instead of fighting for height.
//
// Reads through /api/events (public, status='active' + not-yet-ended,
// server-authoritative — see supabase/migrations/0014_events_module.sql)
// instead of the old static seed array. SWR gives this its loading/error
// states and periodic revalidation for free, so a board left open across
// the daily archive/aggregate cron picks up changes without a manual
// refresh.
export function EventsBoard({ fullHeight = true }: { fullHeight?: boolean }) {
  const { data, error, isLoading } = useSWR<{ events: CoffeeEvent[] }>(
    `/api/events?limit=${EVENTS_LIMIT}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 }
  );

  const gridClasses = fullHeight ? 'max-w-2xl mx-auto grid gap-4 sm:grid-cols-2' : 'grid gap-4 sm:grid-cols-2';
  const wrapperClasses = fullHeight ? 'w-full h-full overflow-y-auto px-6 py-6' : '';
  const emptyClasses = fullHeight
    ? 'w-full h-full flex items-center justify-center text-sm text-ink-400 px-6 text-center'
    : 'text-sm text-ink-400';

  if (isLoading) {
    return (
      <div className={wrapperClasses}>
        <div className={gridClasses}>
          {Array.from({ length: EVENTS_LIMIT }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className={emptyClasses}>Не удалось загрузить афишу — попробуйте обновить страницу.</div>;
  }

  const events = data?.events ?? [];

  if (events.length === 0) {
    return <div className={emptyClasses}>Ближайших мероприятий пока не анонсировано.</div>;
  }

  return (
    <div className={wrapperClasses}>
      <div className={gridClasses}>
        {events.map((event) => (
          <div key={event.id} className="rounded-md border border-ink-200 bg-parchment-100 p-5">
            <p className="text-xs uppercase tracking-widest2 text-gold-500 mb-2">{formatEventDates(event)}</p>
            <h3 className="font-display text-lg text-ink-900 leading-tight mb-1">{event.title}</h3>
            {event.location && <p className="text-sm text-ink-700 mb-3">{event.location}</p>}
            {event.description && <p className="text-sm text-ink-500 mb-3">{event.description}</p>}
            {event.link && (
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
              >
                Подробнее →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
