import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestHeaders, mocks } = vi.hoisted(() => ({
  requestHeaders: vi.fn(),
  mocks: { user: vi.fn(), profile: vi.fn() },
}));
vi.mock('next/headers', () => ({ headers: requestHeaders }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profile() }) }) }) }),
  }),
}));
import { HeadersAdapter } from 'next/dist/server/web/spec-extension/adapters/headers';
import AdminLayout from './layout';

const profile = (role: string) => ({ role, cafe_id: null, roaster_id: null, barista_id: null, display_name: null });

describe('admin server layout', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_PASSWORD', 'test-secret');
    requestHeaders.mockReturnValue(new Headers());
    mocks.user.mockReset().mockReturnValue({ id: 'u1', app_metadata: {} });
    mocks.profile.mockReset().mockReturnValue(profile('admin'));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('renders for a signed-in account with role admin, without Basic Auth', async () => {
    expect(await AdminLayout({ children: 'private admin UI' })).toBe('private admin UI');
  });

  // headers() in a real request is Next's HeadersAdapter, which has its own
  // `headers` field — prod answered 500 on /admin before this was covered.
  it('renders with the real request headers object Next passes to layouts', async () => {
    requestHeaders.mockReturnValue(HeadersAdapter.seal(new HeadersAdapter({ cookie: 'sb-x-auth-token=1' }) as unknown as Headers));
    expect(await AdminLayout({ children: 'private admin UI' })).toBe('private admin UI');
  });

  it('sends a visitor without a session to the login page', async () => {
    mocks.user.mockReturnValue(null);
    await expect(AdminLayout({ children: 'private admin UI' })).rejects.toThrow('redirect:/auth/login?next=%2Fadmin');
  });

  for (const role of ['cafe_admin', 'roaster_admin', 'barista', 'enthusiast']) {
    it(`refuses role ${role}`, async () => {
      mocks.profile.mockReturnValue(profile(role));
      await expect(AdminLayout({ children: 'private admin UI' })).rejects.toThrow(/^redirect:\/auth\/login\?next=%2Fadmin&error=/);
    });
  }

  it('Basic Auth alone no longer opens /admin', async () => {
    mocks.user.mockReturnValue(null);
    requestHeaders.mockReturnValue(new Headers({ authorization: `Basic ${Buffer.from('admin:test-secret').toString('base64')}` }));
    await expect(AdminLayout({ children: 'private admin UI' })).rejects.toThrow('redirect:/auth/login?next=%2Fadmin');
  });

  it('refuses an admin whose temporary password is not changed yet', async () => {
    mocks.user.mockReturnValue({ id: 'u1', app_metadata: { must_change_password: true } });
    await expect(AdminLayout({ children: 'private admin UI' })).rejects.toThrow('redirect:/auth/change-password?next=%2Fadmin');
  });
});
