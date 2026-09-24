import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Roastery production routes: scope comes only from the signed-in
// roaster_admin's profiles.roaster_id; Admin decides visibility per unit.

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

import * as listRoute from './route';
import * as detailRoute from './[id]/route';
import * as transitionRoute from './[id]/transition/route';

const ADMIN_URL = 'https://admin.test';
const SECRET = 'xo-admin-secret-for-tests';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const JOB = '1c9d3f0e-7c1a-4c55-9d0e-1a2b3c4d5e6f';
const fetchMock = vi.fn();

function signInAs(role: string, scope: Partial<Profile> = {}) {
  currentUser = { id: USER_ID };
  currentProfile = { role, cafe_id: null, roaster_id: null, barista_id: null, display_name: null, ...scope };
}
function adminReplies(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}
const params = (id: string) => ({ params: { id } });
const post = (body: unknown) =>
  new Request(`http://passport.test/api/roaster/production/${JOB}/transition`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

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
  it('401 without a session', async () => {
    const statuses = [
      (await listRoute.GET()).status,
      (await detailRoute.GET(new Request('http://x'), params(JOB))).status,
      (await transitionRoute.POST(post({ to: 'in_production' }), params(JOB))).status,
    ];
    expect(statuses).toEqual([401, 401, 401]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403 for a coffee shop account (cannot reach production)', async () => {
    signInAs('cafe_admin', { cafe_id: 'shop-xo-vsevolozhsk' });
    expect((await listRoute.GET()).status).toBe(403);
    expect((await transitionRoute.POST(post({ to: 'in_production' }), params(JOB))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('scope', () => {
  it('XO roastery lists production for roaster-xo', async () => {
    signInAs('roaster_admin', { roaster_id: 'roaster-xo' });
    adminReplies(200, { data: [] });
    expect((await listRoute.GET()).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(`${ADMIN_URL}/api/integrations/coffee-passport/production?roaster_id=roaster-xo`);
  });

  it('a partner roaster is scoped to its own id; a foreign XO job answers 404', async () => {
    signInAs('roaster_admin', { roaster_id: 'roaster-north' });
    adminReplies(404, { error: 'Не найдено.', code: 'not_found' });
    const res = await detailRoute.GET(new Request('http://x'), params(JOB));
    expect(res.status).toBe(404);
    expect(fetchMock.mock.calls[0][0]).toBe(`${ADMIN_URL}/api/integrations/coffee-passport/production/${JOB}?roaster_id=roaster-north`);
  });

  it('a partner roaster cannot mutate XO production by forging roaster_id in the body', async () => {
    signInAs('roaster_admin', { roaster_id: 'roaster-north' });
    adminReplies(404, { error: 'Не найдено.', code: 'not_found' });
    const res = await transitionRoute.POST(post({ to: 'in_production', roaster_id: 'roaster-xo', actor_user_id: 'x' }), params(JOB));
    expect(res.status).toBe(404);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      roaster_id: 'roaster-north',
      actor_user_id: USER_ID,
      to: 'in_production',
      units: null,
    });
  });

  it('forged / malformed production id -> 404 without asking Admin', async () => {
    signInAs('roaster_admin', { roaster_id: 'roaster-xo' });
    expect((await detailRoute.GET(new Request('http://x'), params('../orders'))).status).toBe(404);
    expect((await transitionRoute.POST(post({ to: 'in_production' }), params('abc'))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('transitions', () => {
  it('complete with an explicit produced quantity, returning the fresh state from Admin', async () => {
    signInAs('roaster_admin', { roaster_id: 'roaster-xo' });
    adminReplies(200, { data: { production: { id: JOB, status: 'produced', produced_units: 3 }, already: false } });
    const res = await transitionRoute.POST(post({ to: 'produced', units: 3 }), params(JOB));
    expect(res.status).toBe(200);
    expect((await res.json()).data.production.status).toBe('produced');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: 'produced', units: 3 });
  });

  it.each([
    ['cancel is not a roastery action', { to: 'cancelled' }],
    ['unknown status', { to: 'done' }],
    ['units on start', { to: 'in_production', units: 2 }],
    ['negative units', { to: 'produced', units: -1 }],
    ['fractional units', { to: 'shipped', units: 1.5 }],
  ])('400 for %s', async (_name, body) => {
    signInAs('roaster_admin', { roaster_id: 'roaster-xo' });
    expect((await transitionRoute.POST(post(body), params(JOB))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'stale'],
    [409, 'not_accepted'],
    [400, 'quantity'],
  ])('passes Admin %i %s through for the UI to reload', async (status, code) => {
    signInAs('roaster_admin', { roaster_id: 'roaster-xo' });
    adminReplies(status, { error: 'msg', code });
    const res = await transitionRoute.POST(post({ to: 'in_production' }), params(JOB));
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
});
