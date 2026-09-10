import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EventRow } from '@/lib/types/database';

// Unified Notification/Event Center — covers the new offset/hasMore
// pagination added to this route (section 21: "events/news — 4+ события не
// теряются; пятый и последующие доступны через full list"). No jsdom/
// server infra is installed in this project (see lib/journey/store.test.ts's
// own note on the same constraint) — NextResponse.json still works fine in
// plain Node, so the route's GET handler is exercised directly rather than
// through an HTTP server.

function makeRow(id: string, startDate: string): EventRow {
  return {
    id,
    title: `Event ${id}`,
    location: '',
    description: '',
    start_date: startDate,
    end_date: startDate,
    link: '',
    status: 'active',
    source: 'manual',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

let allRows: EventRow[] = [];

vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              // Mirrors Supabase's .range(from, to) — inclusive on both ends.
              range: (from: number, to: number) =>
                Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

describe('GET /api/events — pagination', () => {
  beforeEach(() => {
    vi.resetModules();
    allRows = Array.from({ length: 23 }, (_, i) =>
      makeRow(`e${i}`, `2026-${String((i % 12) + 1).padStart(2, '0')}-01`)
    );
  });

  it('defaults to limit=5, offset=0 and reports hasMore when the backlog is bigger', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/events'));
    const body = await response.json();

    expect(body.events).toHaveLength(5);
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
    expect(body.hasMore).toBe(true);
  });

  it('pages 5+ events with offset — the 6th event and beyond are reachable', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/events?limit=10&offset=5'));
    const body = await response.json();

    expect(body.events).toHaveLength(10);
    expect(body.events[0].id).toBe('e5');
    expect(body.events[9].id).toBe('e14');
    expect(body.hasMore).toBe(true);
  });

  it('reports hasMore=false once the last page is reached — nothing is lost or duplicated across pages', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/events?limit=10&offset=20'));
    const body = await response.json();

    expect(body.events).toHaveLength(3);
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(['e20', 'e21', 'e22']);
    expect(body.hasMore).toBe(false);
  });

  it('clamps limit to MAX_LIMIT (20) even when a larger value is requested', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/events?limit=500'));
    const body = await response.json();

    expect(body.events).toHaveLength(20);
  });

  it('ignores an invalid/negative offset and falls back to 0', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/events?limit=5&offset=-10'));
    const body = await response.json();

    expect(body.events[0].id).toBe('e0');
  });
});
