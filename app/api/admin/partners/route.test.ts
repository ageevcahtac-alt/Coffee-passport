import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeQuery, type FakeResult } from '@/lib/testing/fakeSupabase';

const { createClient, mocks } = vi.hoisted(() => ({
  createClient: vi.fn(),
  mocks: { user: vi.fn(), profile: vi.fn() },
}));
vi.mock('@/lib/supabase/adminClient', () => ({ createAdminSupabaseClient: createClient }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profile() }) }) }) }),
  }),
}));
import { GET, POST } from './route';
import { PATCH } from './[kind]/[id]/route';
import { POST as IMPORT } from './import/route';

const profile = (role: string) => ({ role, cafe_id: null, roaster_id: null, barista_id: null, display_name: null });
const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/api/admin/partners', { method, body: JSON.stringify(body) });

let rows: { coffee_shops: Record<string, unknown>[]; roasters: Record<string, unknown>[] };
let db: ReturnType<typeof fakeSupabase>;

function handler(query: FakeQuery): FakeResult {
  if (query.table === 'partner_requests') return { data: { id: query.filters.id }, error: null };
  const table = rows[query.table as 'coffee_shops' | 'roasters'];
  if (query.op === 'select') {
    const found = table.filter((row) => Object.entries(query.filters).every(([key, value]) => row[key] === value));
    return { data: query.single ? found[0] ?? null : found, error: null };
  }
  const payload = Array.isArray(query.payload) ? query.payload : [query.payload];
  return { data: query.single ? { id: 'new-uuid', ...payload[0] } : payload, error: null };
}

const writes = (op: string, table?: string) =>
  db.calls.filter((call) => call.op === op && (!table || call.table === table));

beforeEach(() => {
  mocks.user.mockReset().mockReturnValue({ id: 'u1', app_metadata: {} });
  mocks.profile.mockReset().mockReturnValue(profile('admin'));
  rows = { coffee_shops: [], roasters: [] };
  db = fakeSupabase(handler);
  createClient.mockReset().mockReturnValue(db.client);
});

describe('admin partner routes allow only role admin', () => {
  const handlers = [
    ['GET', () => GET()],
    ['POST', () => POST(json({ kind: 'coffee_shop', name: 'T', city: 'C', color: '#000000' }))],
    ['PATCH', () => PATCH(json({ status: 'paused' }, 'PATCH'), { params: { kind: 'coffee_shop', id: 'shop-x' } })],
    ['IMPORT', () => IMPORT(json({ coffeeShops: [], roasters: [] }))],
  ] as const;
  for (const [name, call] of handlers) {
    it(`${name}: 401 without a session, before touching data`, async () => {
      mocks.user.mockReturnValue(null);
      expect((await call()).status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    });
    for (const role of ['cafe_admin', 'roaster_admin', 'barista', 'enthusiast']) {
      it(`${name}: 403 to ${role}, before touching data`, async () => {
        mocks.profile.mockReturnValue(profile(role));
        expect((await call()).status).toBe(403);
        expect(createClient).not.toHaveBeenCalled();
      });
    }
  }
});

describe('POST /api/admin/partners — activation writes the database', () => {
  it('binds a request to the built-in XO card: same id, its point, the chosen colour, request activated', async () => {
    const response = await POST(json({
      kind: 'coffee_shop', bindId: 'shop-xo-vsevolozhsk', requestId: 'req-1',
      name: 'XO Coffee', city: 'Всеволожск', color: '#AB12CD',
    }));
    expect(response.status).toBe(201);
    const [insert] = writes('insert', 'coffee_shops');
    expect(insert.payload).toMatchObject({
      slug: 'shop-xo-vsevolozhsk', status: 'active', brand_color: '#ab12cd', lat: 60.0167, lng: 30.6394, partner_request_id: 'req-1',
    });
    const [request] = writes('update', 'partner_requests');
    expect(request.filters).toEqual({ id: 'req-1' });
    expect(request.payload).toMatchObject({ status: 'activated' });
    expect((await response.json()).partner).toMatchObject({ id: 'shop-xo-vsevolozhsk', brandColor: '#ab12cd' });
  });

  it('creates a new shop with a free slug and the point from the form', async () => {
    rows.coffee_shops.push({ slug: 'shop-тест', partner_request_id: null });
    const response = await POST(json({ kind: 'coffee_shop', name: 'Тест', city: 'Казань', color: '#112233', lat: 55.79, lng: 49.12 }));
    expect(response.status).toBe(201);
    expect(writes('insert', 'coffee_shops')[0].payload).toMatchObject({ slug: 'shop-тест-2', lat: 55.79, lng: 49.12, city: 'Казань' });
    expect(writes('update', 'partner_requests')).toHaveLength(0);
  });

  it('fills a thin roaster anchor row from the lot backfill instead of inserting a duplicate', async () => {
    rows.roasters.push({ slug: 'roaster-xo', partner_request_id: null });
    const response = await POST(json({ kind: 'roaster', bindId: 'roaster-xo', name: 'XO COFFEE Roasting', city: 'Всеволожск', color: '#D4AF37' }));
    expect(response.status).toBe(201);
    expect(writes('insert', 'roasters')).toHaveLength(0);
    const [update] = writes('update', 'roasters');
    expect(update.filters).toEqual({ slug: 'roaster-xo' });
    expect(update.payload).toMatchObject({ color: '#d4af37', status: 'active', philosophy: expect.any(String) });
  });

  it('refuses an unknown built-in card, a card already linked to a request, and a request already activated', async () => {
    expect((await POST(json({ kind: 'coffee_shop', bindId: 'shop-nope', name: 'T', city: 'C', color: '#000000' }))).status).toBe(400);
    rows.coffee_shops.push({ slug: 'shop-xo-vsevolozhsk', partner_request_id: 'other' });
    expect((await POST(json({ kind: 'coffee_shop', bindId: 'shop-xo-vsevolozhsk', name: 'T', city: 'C', color: '#000000' }))).status).toBe(409);
    expect((await POST(json({ kind: 'coffee_shop', requestId: 'other', name: 'T', city: 'C', color: '#000000' }))).status).toBe(409);
    expect(writes('insert')).toHaveLength(0);
    expect(writes('update')).toHaveLength(0);
  });

  it('rejects a bad colour before opening the database', async () => {
    expect((await POST(json({ kind: 'coffee_shop', name: 'T', city: 'C', color: 'red' }))).status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('GET / PATCH / import', () => {
  it('GET lists both tables mapped to app ids', async () => {
    rows.coffee_shops.push({ slug: 'shop-a', name: 'A', status: 'paused', brand_color: '#000000' });
    rows.roasters.push({ slug: 'roaster-xo', name: 'XO', status: 'active' });
    const body = await (await GET()).json();
    expect(body.coffeeShops.map((shop: { id: string; status: string }) => [shop.id, shop.status])).toEqual([['shop-a', 'paused']]);
    expect(body.roasters[0]).toMatchObject({ id: 'roaster-xo', slug: 'xo-coffee', city: 'Всеволожск' });
  });

  it('PATCH changes only the allowed fields of one row by its slug', async () => {
    rows.coffee_shops.push({ slug: 'shop-a', name: 'A' });
    const response = await PATCH(json({ status: 'paused', color: '#00FF00', slug: 'evil' }, 'PATCH'), { params: { kind: 'coffee_shop', id: 'shop-a' } });
    expect(response.status).toBe(200);
    const [update] = writes('update', 'coffee_shops');
    expect(update.filters).toEqual({ slug: 'shop-a' });
    expect(update.payload).toEqual({ status: 'paused', brand_color: '#00ff00', updated_at: expect.any(String) });
  });

  it('PATCH answers 404 for an unknown kind or a missing row, 400 for a bad status', async () => {
    expect((await PATCH(json({ status: 'paused' }, 'PATCH'), { params: { kind: 'bar', id: 'x' } })).status).toBe(404);
    expect((await PATCH(json({ status: 'paused' }, 'PATCH'), { params: { kind: 'roaster', id: 'roaster-x' } })).status).toBe(404);
    expect((await PATCH(json({ status: 'gone' }, 'PATCH'), { params: { kind: 'roaster', id: 'roaster-x' } })).status).toBe(400);
  });

  it('import inserts only cards missing from the database and never overwrites', async () => {
    rows.coffee_shops.push({ slug: 'shop-xo-vsevolozhsk' });
    const local = (id: string, brandColor = '#123456') => ({ id, name: id, city: 'Город', brandColor, lat: 59.9, lng: 30.3 });
    const response = await IMPORT(json({
      coffeeShops: [local('shop-xo-vsevolozhsk'), local('shop-local'), local('shop-bad', 'javascript:1')],
      roasters: [{ id: 'roaster-sun', name: 'Sun', slug: 'sun', color: '#AAAAAA', philosophy: '', city: 'Москва', country: 'Россия' }],
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      created: ['shop-local', 'roaster-sun'],
      skipped: [{ id: 'shop-xo-vsevolozhsk', reason: 'exists' }, { id: 'shop-bad', reason: 'invalid' }],
    });
    expect(writes('insert', 'coffee_shops').map((call) => (call.payload as { slug: string }[]).map((row) => row.slug))).toEqual([['shop-local']]);
    expect(writes('update')).toHaveLength(0);
  });
});
