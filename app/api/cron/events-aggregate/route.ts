import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { isCronRequestAuthorized } from '@/lib/events/cronAuth';
import { getEventSources } from '@/lib/events/sources';
import { ensureCuratedEvents } from '@/lib/events/curatedEvents';
import { checkEventLink } from '@/lib/events/linkCheck';

// Daily aggregator pass: pulls candidates from every configured
// EventSource (see lib/events/sources — none by default, an operator
// plugs in real .ics feed URLs via EVENT_SOURCE_ICS_URLS) and inserts
// each as status='pending_review' via events_ingest_candidate, which
// dedupes on (title, start_date) — a source that returns the same event
// twice, or an event this run already ingested before, is a no-op, not a
// duplicate row. New candidates never touch the public board until an
// admin approves them in /dashboard/admin/events.
//
// Пакет №4: (1) ссылка кандидата проверяется перед записью — битая
// обнуляется, мёртвых ссылок на витрине нет; (2) после ingestion — top-up
// кураторской лентой: на витрине ВСЕГДА ≥4 ближайших события, даже если
// внешние источники молчат (гарантия на уровне данных, не UI).
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const sources = getEventSources();

  let candidatesSeen = 0;
  let inserted = 0;
  let deadLinksBlanked = 0;
  const sourceErrors: { source: string; error: string }[] = [];

  for (const source of sources) {
    let candidates;
    try {
      candidates = await source.fetch();
    } catch (err) {
      sourceErrors.push({ source: source.id, error: err instanceof Error ? err.message : 'Unknown fetch error' });
      continue;
    }

    for (const candidate of candidates) {
      candidatesSeen += 1;
      // Пакет №4: ссылку, которая не подтвердилась живой, обнуляем — событие
      // публикуется без ссылки, а не с 404 на витрине. Кандидат ещё не
      // публичен (pending_review), поэтому «unknown» (сеть/таймаут) здесь
      // тоже обнуляем: непроверенная ссылка на витрину не попадает никогда.
      let link = candidate.link.trim();
      if (link && (await checkEventLink(link)) !== 'ok') {
        link = '';
        deadLinksBlanked += 1;
      }
      const { data, error } = await supabase.rpc('events_ingest_candidate', {
        p_title: candidate.title,
        p_location: candidate.location,
        p_description: candidate.description,
        p_start_date: candidate.startDate,
        p_end_date: candidate.endDate,
        p_link: link,
        p_source: source.id,
      });
      if (error) {
        sourceErrors.push({ source: source.id, error: error.message });
        continue;
      }
      if (data === true) inserted += 1;
    }
  }

  let topUp = { activeCount: 0, inserted: 0 };
  let topUpError: string | null = null;
  try {
    topUp = await ensureCuratedEvents(supabase);
  } catch (err) {
    topUpError = err instanceof Error ? err.message : 'Unknown top-up error';
    console.error('[cron/events-aggregate] curated top-up failed', err);
  }

  return NextResponse.json({
    sourcesConfigured: sources.length,
    candidatesSeen,
    inserted,
    deadLinksBlanked,
    sourceErrors,
    curatedTopUp: { ...topUp, error: topUpError },
  });
}
