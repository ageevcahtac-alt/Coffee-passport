import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Coffee Shop -> Roastery order routes. The signed-in profile and XO COFFEE
// Admin are both faked: the session via the supabase server-client factory
// (same "mock the factory module" approach as app/api/events/route.test.ts),
// Admin via global fetch — so what is asserted is exactly what Passport
// would send over the wire.

type Profile = { role: string; cafe_id: string | null; roaster_id: string | null; barista_id: null; display_name: null };
let currentUser: { id: string } | null = null;
let currentProfile: Profile | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: currentProfile, error: null }) }),
      }),
    }),
  }),
}));

import * as ordersRoute from './route';
import * as catalogRoute from './catalog/route';

const ADMIN_URL = 'https://admin.test';
const SECRET = 'xo-admin-secret-for-tests';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const VARIANT = '0b9d3f0e-7c1a-4c55-9d0e-1a2b3c4d5e6f';

const fetchMock = vi.fn();

function signInAs(role: string, scope: Partial<Profile> = {}) {
  currentUser = { id: USER_ID };
  currentProfile = { role, cafe_id: null, roaster_id: null, barista_id: null, display_name: null, ...scope };
}

function adminReplies(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

const post = (body: unknown) =>
  new Request('http://passport.test/api/cafe/roastery-orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const validBody = {
  idempotency_key: 'draft-0001-abcdef',
  destination_type: 'coffee_shop',
  address: 'г. Всеволожск, Колтушское шоссе, 1',
  contact: 'Алексей',
  items: [{ variant_id: VARIANT, quantity: 5 }],
};

beforeEach(() => {
  vi.stubEnv('XO_ADMIN_INTEGRATION_URL', ADMIN_URL);
  vi.stubEnv('XO_ADMIN_INTEGRATION_SECRET', SECRET);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  currentUser = null;
  currentProfile = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authentication and role', () => {
  it('401 without a session — Admin is never called', async () => {
    const responses = [await ordersRoute.GET(), await ordersRoute.POST(post(validBody)), await catalogRoute.GET()];
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['enthusiast', {}],
    ['roaster_admin', { roaster_id: 'roaster-xo' }],
    ['barista', { cafe_id: 'shop-xo-vsevolozhsk' }],
  ])('403 for a %s account', async (role, scope) => {
    signInAs(role, scope as Partial<Profile>);
    expect((await ordersRoute.GET()).status).toBe(403);
    expect((await ordersRoute.POST(post(validBody))).status).toBe(403);
    expect((await catalogRoute.GET()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403 for a cafe account whose shop is unknown to Passport', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-does-not-exist' });
    expect((await ordersRoute.GET()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST — create an order to the roastery', () => {
  it('sends the SESSION shop identity, server-built destination and ids/quantities only', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    adminReplies(201, { data: { orderId: 'order-1' } });

    const res = await ordersRoute.POST(
      post({
        ...validBody,
        // Everything below is forged by the browser and must be ignored.
        coffee_shop: { id: 'shop-a-spb', name: 'Чужая кофейня' },
        coffee_shop_id: 'shop-a-spb',
        destination_label: 'Куда угодно',
        items: [{ variant_id: VARIANT, quantity: 5, price: 1, weight_grams: 1, passport_public_id: 'LOT-FAKE' }],
      })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { orderId: 'order-1' } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ADMIN_URL}/api/integrations/coffee-passport/orders`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body)).toEqual({
      idempotency_key: 'draft-0001-abcdef',
      coffee_shop: { id: 'shop-xo-vsevolozhsk', name: 'XO Coffee' },
      actor_user_id: USER_ID,
      contact: 'Алексей',
      destination: { type: 'coffee_shop', label: 'XO Coffee · Всеволожск', address: 'г. Всеволожск, Колтушское шоссе, 1' },
      items: [{ variant_id: VARIANT, quantity: 5 }],
    });
  });

  it('roastery pickup carries no address', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    adminReplies(201, { data: { orderId: 'order-2' } });
    await ordersRoute.POST(post({ ...validBody, destination_type: 'roastery_pickup' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).destination).toEqual({
      type: 'roastery_pickup',
      label: 'Ростерия XO COFFEE (самовывоз)',
      address: null,
    });
  });

  it.each([
    ['no idempotency key', { ...validBody, idempotency_key: undefined }],
    ['empty cart', { ...validBody, items: [] }],
    ['quantity 0', { ...validBody, items: [{ variant_id: VARIANT, quantity: 0 }] }],
    ['quantity over the limit', { ...validBody, items: [{ variant_id: VARIANT, quantity: 1001 }] }],
    ['forged variant id', { ...validBody, items: [{ variant_id: "1' or 1=1", quantity: 1 }] }],
    ['unknown destination', { ...validBody, destination_type: 'teleport' }],
    ['not JSON object', 'hello'],
  ])('400 for %s — Admin is never called', async (_name, body) => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    expect((await ordersRoute.POST(post(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a retried submit reuses the same idempotency key (Admin dedupes)', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    adminReplies(201, { data: { orderId: 'order-1' } });
    adminReplies(201, { data: { orderId: 'order-1' } });
    const first = await (await ordersRoute.POST(post(validBody))).json();
    const second = await (await ordersRoute.POST(post(validBody))).json();
    expect(second).toEqual(first);
    const keys = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).idempotency_key);
    expect(keys).toEqual(['draft-0001-abcdef', 'draft-0001-abcdef']);
  });

  it('passes an Admin business refusal through (409), without leaking anything else', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    adminReplies(409, { error: 'Этот ключ запроса уже использован другим заказом.', code: 'idempotency_conflict' });
    const res = await ordersRoute.POST(post(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('idempotency_conflict');
  });
});

describe('Admin unavailable', () => {
  it.each([
    ['not configured', () => vi.stubEnv('XO_ADMIN_INTEGRATION_SECRET', '')],
    ['network failure', () => fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))],
    ['timeout', () => fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))],
    ['Admin 500', () => adminReplies(500, { error: 'boom: relation "orders" does not exist' })],
    ['Admin 401 (secret mismatch)', () => adminReplies(401, { error: 'Unauthorized.' })],
    ['Admin 503 (not configured there)', () => adminReplies(503, { error: 'Coffee Passport integration is not configured.' })],
  ])('%s -> 503 admin_unavailable with a generic message', async (_name, arrange) => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    arrange();
    const res = await ordersRoute.GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('admin_unavailable');
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
});

describe('GET — own orders only', () => {
  it("asks Admin for the session shop's orders, whatever the URL says", async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    adminReplies(200, { data: [{ id: 'o1', number: 'XO-000001' }] });
    const res = await ordersRoute.GET();
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(`${ADMIN_URL}/api/integrations/coffee-passport/orders?coffee_shop_id=shop-xo-vsevolozhsk`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('never includes the Admin secret in what the browser receives', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    adminReplies(200, { data: [] });
    const text = await (await catalogRoute.GET()).text();
    expect(text).not.toContain(SECRET);
  });
});
