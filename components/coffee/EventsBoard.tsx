'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formatDate } from '@/lib/utils/date';
import { openNotificationCenter } from '@/lib/notifications/centerControl';
import type { CoffeeEvent } from '@/lib/types/coffee';

const EVENTS_LIMIT = 5; // preview mode — dashboard card grid
const PAGE_SIZE = 10; // full mode — one "Показать ещё" page

async function fetcher(url: string): Promise<{ events: CoffeeEvent[]; hasMore?: boolean }> {
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

function EventCard({ event }: { event: CoffeeEvent }) {
  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
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
  );
}

// fullHeight (default true) fits the isolated /map tab, which needs its own
// scroll region inside a fixed-height flex parent. Embedding this inline in
// a normal document-flow page (e.g. /journey) passes fullHeight={false} so
// it renders as plain block content instead of fighting for height.
//
// Reads through /api/events (public, status='active' + not-yet-ended,
// server-authoritative — see supabase/migrations/0014_events_module.sql)
// instead of the old static seed array.
//
// Notification/Event Center — mode='preview' (default) is the original
// capped-at-5, periodically-revalidating dashboard card, now with a "Все
// мероприятия" link into the shared center instead of the cap being the
// only way to see the board at all. mode='full' is that same board's
// unbounded counterpart (used by the Center's Events tab and /map's
// "Мероприятия" view) — pages through /api/events' new `offset` param
// PAGE_SIZE rows at a time via "Показать ещё" rather than ever fetching
// the whole backlog in one request.
export function EventsBoard({
  fullHeight = true,
  mode = 'preview',
}: {
  fullHeight?: boolean;
  mode?: 'preview' | 'full';
}) {
  if (mode === 'full') return <EventsBoardFull fullHeight={fullHeight} />;
  return <EventsBoardPreview fullHeight={fullHeight} />;
}

function EventsBoardPreview({ fullHeight }: { fullHeight: boolean }) {
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
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => openNotificationCenter('events')}
          className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          Все мероприятия →
        </button>
      </div>
    </div>
  );
}

function EventsBoardFull({ fullHeight }: { fullHeight: boolean }) {
  const [events, setEvents] = useState<CoffeeEvent[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetcher(`/api/events?limit=${PAGE_SIZE}&offset=0`)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setHasMore(Boolean(result.hasMore));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function loadMore() {
    if (!events || loadingMore) return;
    setLoadingMore(true);
    fetcher(`/api/events?limit=${PAGE_SIZE}&offset=${events.length}`)
      .then((result) => {
        setEvents((prev) => [...(prev ?? []), ...result.events]);
        setHasMore(Boolean(result.hasMore));
      })
      .catch(() => setError(true))
      .finally(() => setLoadingMore(false));
  }

  const gridClasses = fullHeight ? 'max-w-2xl mx-auto grid gap-4 sm:grid-cols-2' : 'grid gap-4 sm:grid-cols-2';
  const wrapperClasses = fullHeight ? 'w-full h-full overflow-y-auto px-6 py-6' : '';
  const emptyClasses = fullHeight
    ? 'w-full h-full flex items-center justify-center text-sm text-ink-400 px-6 text-center'
    : 'text-sm text-ink-400';

  if (events === null && !error) {
    return (
      <div className={wrapperClasses}>
        <div className={gridClasses}>
          {Array.from({ length: 4 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !events) {
    return <div className={emptyClasses}>Не удалось загрузить афишу — попробуйте обновить страницу.</div>;
  }

  if (!events || events.length === 0) {
    return <div className={emptyClasses}>Ближайших мероприятий пока не анонсировано.</div>;
  }

  return (
    <div className={wrapperClasses}>
      <div className={gridClasses}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-5 py-2.5
                       hover:bg-parchment-300 transition-colors disabled:opacity-40"
          >
            {loadingMore ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      )}
    </div>
  );
}
