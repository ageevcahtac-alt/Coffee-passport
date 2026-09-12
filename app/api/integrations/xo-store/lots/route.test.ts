import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// P23 — read-only XO Store integration boundary. No jsdom/server infra is
// installed in this project (see app/api/events/route.test.ts's own note
// on the same constraint) — the GET handler is exercised directly.

const XO_ROASTER_ID = 'a8143369-2b52-463b-b06e-f3f5bd194f9b';
const NORTH_STAR_ROASTER_ID = 'c08103cc-e1b0-4434-a973-5f5d2cd861c7';
const SECRET = 'test-xo-store-secret';

type LotFixture = {
  public_id: string;
  name: string;
  q_grade: number | null;
  roaster_id: string;
  status: string;
  in_roaster_catalog: boolean;
  green_lots: { coffees: { country: string; region: string; variety: string; processing: string } | null } | null;
};

let allLots: LotFixture[] = [];

function makeLot(overrides: Partial<LotFixture>): LotFixture {
  return {
    public_id: 'LOT-XO-ETH-001',
    name: 'Ethiopia Guji',
    q_grade: 87,
    roaster_id: XO_ROASTER_ID,
    status: 'active',
    in_roaster_catalog: true,
    green_lots: { coffees: { country: 'Ethiopia', region: 'Guji', variety: 'Heirloom', processing: 'Washed' } },
    ...overrides,
  };
}

// Mirrors app/api/events/route.test.ts's mocking shape: mock the client
// factory module, chain the same builder methods the route actually calls,
// and resolve with data filtered exactly the way real Postgres/RLS would.
vi.mock('@/lib/supabase/publicServerClient', () => ({
  createPublicSupabaseClient: () => ({
    from(table: string) {
      if (table === 'roasters') {
        return {
          select: () => ({
            eq: (_col: string, slug: string) => ({
              maybeSingle: () =>
                Promise.resolve(
                  slug === 'roaster-xo' ? { data: { id: XO_ROASTER_ID }, error: null } : { data: null, error: null }
                ),
            }),
          }),
        };
      }
      if (table === 'lots') {
        return {
          select: () => ({
            eq: (col1: string, val1: string) => ({
              eq: (col2: string, val2: string) => ({
                eq: (col3: string, val3: boolean) => ({
                  order: () =>
                    Promise.resolve({
                      data: allLots.filter(
                        (lot) =>
                          (lot as unknown as Record<string, unknown>)[col1] === val1 &&
                          (lot as unknown as Record<string, unknown>)[col2] === val2 &&
                          (lot as unknown as Record<string, unknown>)[col3] === val3
                      ),
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  }),
}));

function authedRequest() {
  return new Request('http://localhost/api/integrations/xo-store/lots', {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

describe('GET /api/integrations/xo-store/lots', () => {
  const originalSecret = process.env.XO_STORE_INTEGRATION_SECRET;

  beforeEach(() => {
    vi.resetModules();
    process.env.XO_STORE_INTEGRATION_SECRET = SECRET;
    allLots = [
      makeLot({ public_id: 'LOT-XO-ETH-001', name: 'Ethiopia Guji' }),
      makeLot({
        public_id: 'LOT-XO-COL-004',
        name: 'Colombia Huila',
        green_lots: { coffees: { country: 'Colombia', region: 'Huila', variety: 'Castillo, Caturra', processing: 'Natural' } },
      }),
      // A P16 E2E test fixture — draft, must never reach the response.
      makeLot({ public_id: 'LOT-XO-ETH-002', name: 'TEST FLOW A', status: 'draft', green_lots: null }),
      // A different roaster's Lot — must never reach the response.
      makeLot({
        public_id: 'LOT-NS-KEN-002',
        name: 'Kenya Nyeri',
        roaster_id: NORTH_STAR_ROASTER_ID,
        green_lots: { coffees: { country: 'Kenya', region: 'Nyeri', variety: 'SL28, SL34', processing: 'Washed' } },
      }),
    ];
  });

  afterEach(() => {
    process.env.XO_STORE_INTEGRATION_SECRET = originalSecret;
  });

  it('Test 1: returns XO-owned Lots', async () => {
    const { GET } = await import('./route');
    const response = await GET(authedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lots.map((l: { public_id: string }) => l.public_id)).toEqual(
      expect.arrayContaining(['LOT-XO-ETH-001', 'LOT-XO-COL-004'])
    );
  });

  it('Test 2: another roaster (North Star) never appears in the response', async () => {
    const { GET } = await import('./route');
    const response = await GET(authedRequest());
    const body = await response.json();

    expect(body.lots.map((l: { public_id: string }) => l.public_id)).not.toContain('LOT-NS-KEN-002');
  });

  it('Test 3: each returned Lot carries public_id as its identity', async () => {
    const { GET } = await import('./route');
    const response = await GET(authedRequest());
    const body = await response.json();

    expect(body.lots.length).toBeGreaterThan(0);
    for (const lot of body.lots) {
      expect(typeof lot.public_id).toBe('string');
      expect(lot.public_id.length).toBeGreaterThan(0);
      expect(lot).not.toHaveProperty('id');
      expect(lot).not.toHaveProperty('roaster_id');
    }
  });

  it('Test 4: draft/test-fixture Lots are excluded', async () => {
    const { GET } = await import('./route');
    const response = await GET(authedRequest());
    const body = await response.json();

    expect(body.lots.map((l: { public_id: string }) => l.public_id)).not.toContain('LOT-XO-ETH-002');
  });

  it('Test 5: a new XO Lot appears automatically once it exists (fixture-level proof — no code change needed)', async () => {
    allLots.push(
      makeLot({
        public_id: 'LOT-XO-NEW-005',
        name: 'Brazil Cerrado',
        green_lots: { coffees: { country: 'Brazil', region: 'Cerrado', variety: 'Bourbon', processing: 'Natural' } },
      })
    );

    const { GET } = await import('./route');
    const response = await GET(authedRequest());
    const body = await response.json();

    expect(body.lots.map((l: { public_id: string }) => l.public_id)).toContain('LOT-XO-NEW-005');
  });

  it('rejects a request with no Authorization header', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/integrations/xo-store/lots'));

    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/integrations/xo-store/lots', {
        headers: { authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('fails closed when XO_STORE_INTEGRATION_SECRET is not configured', async () => {
    delete process.env.XO_STORE_INTEGRATION_SECRET;
    const { GET } = await import('./route');
    const response = await GET(authedRequest());

    expect(response.status).toBe(401);
  });

  it('only exports GET — no mutation handlers', async () => {
    const route = (await import('./route')) as Record<string, unknown>;
    expect(route.POST).toBeUndefined();
    expect(route.PUT).toBeUndefined();
    expect(route.PATCH).toBeUndefined();
    expect(route.DELETE).toBeUndefined();
  });
});
