import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// «Найти на карте по адресу» in the cafe cabinet: the browser asks this route,
// the server asks Nominatim. Session faked the same way as
// app/api/cafe/roastery-orders/route.test.ts; Nominatim via global fetch.

type Profile = { role: string; cafe_id: string | null; roaster_id: null; barista_id: null; display_name: null };
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

import { GET } from './route';

const fetchMock = vi.fn();
const get = (q: string | null) =>
  new Request(`http://passport.test/api/cafe/geocode${q === null ? '' : `?q=${encodeURIComponent(q)}`}`);

function signInAs(role: string) {
  currentUser = { id: '44444444-4444-4444-8444-444444444444' };
  currentProfile = { role, cafe_id: 'shop-1', roaster_id: null, barista_id: null, display_name: null };
}

describe('GET /api/cafe/geocode', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    currentUser = null;
    currentProfile = null;
  });

  it('401 without a session, Nominatim not called', async () => {
    const res = await GET(get('Москва'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403 for a non-cafe role', async () => {
    signInAs('roaster_admin');
    const res = await GET(get('Москва'));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 for an empty or oversized query', async () => {
    signInAs('cafe_admin');
    expect((await GET(get(null))).status).toBe(400);
    expect((await GET(get('   '))).status).toBe(400);
    expect((await GET(get('а'.repeat(301)))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('200 with coordinates from Nominatim, asked by the server', async () => {
    signInAs('cafe_admin');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '60.03', lon: '30.64' }]), { status: 200 }));
    const res = await GET(get('Всеволожск, Октябрьский проспект 1'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ lat: 60.03, lng: 30.64 });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('404 when the address is not found', async () => {
    signInAs('cafe_admin');
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const res = await GET(get('нет такого адреса 12345'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'not_found' });
  });
});
