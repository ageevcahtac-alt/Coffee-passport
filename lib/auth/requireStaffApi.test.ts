import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profile() }) }) }) }),
  }),
}));

import { requireStaffApi } from './requireStaffApi';

const BARISTA = { role: 'barista', cafe_id: 'shop-x', roaster_id: null, barista_id: 'barista-x', display_name: 'Анна' };

describe('requireStaffApi', () => {
  beforeEach(() => {
    mocks.profile.mockReset().mockReturnValue(BARISTA);
    mocks.user.mockReset().mockReturnValue({ id: 'u1', app_metadata: {} });
  });

  it('lets a barista who set their own password through', async () => {
    const result = await requireStaffApi('barista');
    expect(result.ok).toBe(true);
  });

  // The cabinet UI already bounces to /auth/change-password; the API must
  // refuse on its own, not rely on the page.
  it('403 password_change_required while the temporary password is still in place', async () => {
    mocks.user.mockReturnValue({
      id: 'u1',
      app_metadata: { must_change_password: true, temporary_password_expires_at: '2099-01-01T00:00:00.000Z' },
    });
    const result = await requireStaffApi('barista');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect((await result.response.json()).code).toBe('password_change_required');
  });

  it('401 without a session', async () => {
    mocks.user.mockReturnValue(null);
    const result = await requireStaffApi('barista');
    expect(!result.ok && result.response.status).toBe(401);
  });
});
