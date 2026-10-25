import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { GET } from './route';
import { PATCH } from './[id]/route';

function request(method = 'GET', authorization?: string) {
  return new Request('http://localhost/api/admin/partner-requests', {
    method,
    headers: authorization ? { authorization } : {},
    ...(method === 'PATCH' ? { body: JSON.stringify({ status: 'new' }) } : {}),
  });
}
const profile = (role: string) => ({ role, cafe_id: 'shop-x', roaster_id: null, barista_id: null, display_name: null });
const basic = (value: string) => `Basic ${Buffer.from(value).toString('base64')}`;

describe('admin handlers allow only a session with role admin', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_USER', 'admin');
    vi.stubEnv('ADMIN_PASSWORD', 'test-secret');
    mocks.user.mockReset().mockReturnValue({ id: 'u1', app_metadata: {} });
    mocks.profile.mockReset().mockReturnValue(profile('admin'));
    createClient.mockReset();
    createClient.mockReturnValue({
      from: () => ({
        select: () => ({ order: async () => ({ data: [], error: null }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead' }, error: null }) }) }) }),
      }),
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const [name, handler] of [
    ['GET', (req: Request) => GET(req)],
    ['PATCH', (req: Request) => PATCH(req, { params: { id: 'lead' } })],
  ] as const) {
    it(`${name} answers 200 to an admin session without Basic Auth`, async () => {
      expect((await handler(request(name))).status).toBe(200);
      expect(createClient).toHaveBeenCalledOnce();
    });

    it(`${name} answers 401 without a session, before touching data`, async () => {
      mocks.user.mockReturnValue(null);
      const response = await handler(request(name));
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('unauthenticated');
      expect(createClient).not.toHaveBeenCalled();
    });

    for (const role of ['cafe_admin', 'roaster_admin', 'barista', 'enthusiast']) {
      it(`${name} answers 403 to role ${role}, before touching data`, async () => {
        mocks.profile.mockReturnValue(profile(role));
        const response = await handler(request(name));
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('forbidden');
        expect(createClient).not.toHaveBeenCalled();
      });
    }

    it(`${name} answers 403 to a cafe session even with a bad Basic header`, async () => {
      mocks.profile.mockReturnValue(profile('cafe_admin'));
      expect((await handler(request(name, basic('admin:wrong')))).status).toBe(403);
      expect(createClient).not.toHaveBeenCalled();
    });
  }
});
