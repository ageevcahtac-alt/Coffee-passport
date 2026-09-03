import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import type { EventRow } from '@/lib/types/database';
import type { CoffeeEvent } from '@/lib/types/coffee';

// Next.js's App Router patches global fetch and caches GET-like requests
// by default — including ones made by supabase-js under the hood — so
// without this, a newly-archived or newly-approved event wouldn't show up
// here until some arbitrary cache TTL passed. Found live: after approving
// a pending_review candidate in /dashboard/admin/events, this route kept
// serving the pre-approval snapshot. This is the one board where
// staleness defeats the whole point ("auto-updating"), so every request
// re-fetches.
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

function rowToEvent(row: EventRow): CoffeeEvent {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    link: row.link,
    status: row.status,
    source: row.source,
  };
}

// Public board feed — ONLY status='active' events that haven't ended yet,
// nearest first, capped at `limit` (default 5). The events table's own
// RLS policy (see supabase/migrations/0014_events_module.sql) enforces
// the same filter at the DB layer too — this route's explicit .eq/.gte
// is not the only gate, just the documented contract.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get('limit'));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const supabase = createAdminSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'active')
    .gte('end_date', today)
    .order('start_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[api/events] list failed', error);
    return NextResponse.json({ error: 'Не удалось загрузить мероприятия.' }, { status: 500 });
  }

  return NextResponse.json({ events: (data ?? []).map(rowToEvent) });
}
