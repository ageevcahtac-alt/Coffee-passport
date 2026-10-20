import { describe, expect, it, vi, beforeEach } from 'vitest';

// /api/health is the production liveness + database probe used after every
// deploy (deploy/timeweb/update-app.sh). Exercised directly, like the other
// route tests here — no HTTP server needed.

let queryResult: Promise<{ data: unknown; error: { message: string } | null }>;

vi.mock('@/lib/supabase/publicServerClient', () => ({
  createPublicSupabaseClient: () => ({
    from: (table: string) => {
      expect(table).toBe('lots');
      return {
        select: () => ({
          limit: () => ({
            abortSignal: () => queryResult,
          }),
        }),
      };
    },
  }),
}));

const { GET } = await import('./route');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('answers 200 ok when the database query succeeds', async () => {
    queryResult = Promise.resolve({ data: [], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(typeof body.db_latency_ms).toBe('number');
  });

  it('answers 503 when the database returns an error, without leaking it', async () => {
    queryResult = Promise.resolve({ data: null, error: { message: 'permission denied for table lots' } });
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ status: 'error', db: 'error' });
    expect(text).not.toContain('permission denied');
  });

  it('answers 503 when the database call throws (network / timeout)', async () => {
    queryResult = Promise.reject(new Error('The operation was aborted due to timeout'));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'error', db: 'error' });
  });
});
