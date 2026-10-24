import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireStaffRole } from './requireStaffRole';

const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

const BARISTA_PROFILE = {
  role: 'barista',
  cafe_id: 'shop-xo-vsevolozhsk',
  roaster_id: null,
  barista_id: 'barista-1',
  display_name: 'Анна',
};

describe('requireStaffRole — temporary password', () => {
  beforeEach(() => {
    mocks.redirect.mockReset().mockImplementation((path: string) => {
      throw new Error(path);
    });
    mocks.profile.mockReset().mockResolvedValue({ data: BARISTA_PROFILE });
  });

  it('sends a login created by the cafe to change its password before the cabinet opens', async () => {
    mocks.user.mockReturnValue({ id: 'u1', app_metadata: { must_change_password: true } });
    await expect(requireStaffRole('barista', '/dashboard/barista')).rejects.toThrow(
      '/auth/change-password?next=%2Fdashboard%2Fbarista'
    );
  });

  it('opens the cabinet once the password has been changed', async () => {
    mocks.user.mockReturnValue({ id: 'u1', app_metadata: { must_change_password: false } });
    await expect(requireStaffRole('barista', '/dashboard/barista')).resolves.toMatchObject({
      userId: 'u1',
      role: 'barista',
      cafeId: 'shop-xo-vsevolozhsk',
      baristaId: 'barista-1',
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
