import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeTemporaryPassword } from './actions';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  updateUserById: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }), signInWithPassword: mocks.signIn },
  }),
}));
vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => ({ auth: { admin: { updateUserById: mocks.updateUserById } } }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const NEW_PASSWORD = 'my-own-password-2026';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('changeTemporaryPassword', () => {
  beforeEach(() => {
    mocks.redirect.mockReset().mockImplementation((path: string) => {
      throw new Error(path);
    });
    mocks.updateUserById.mockReset().mockResolvedValue({ data: { user: {} }, error: null });
    mocks.user.mockReset().mockReturnValue({ id: 'u1', email: 'anna@example.com', app_metadata: { must_change_password: true } });
    mocks.signIn.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // Prod run 40112929720: the admin password change ended the session and the
  // barista landed on /auth/login instead of the cabinet.
  it('signs the barista back in with the new password so the cabinet opens without a second login', async () => {
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow('/dashboard/barista');
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'anna@example.com', password: NEW_PASSWORD });
    expect(mocks.updateUserById.mock.invocationCallOrder[0]).toBeLessThan(mocks.signIn.mock.invocationCallOrder[0]);
  });

  it('if the fresh sign-in fails, sends to login with an explanation instead of a silent bounce', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'x' } });
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/login\?next=%2Fdashboard%2Fbarista&error=/);
  });

  it('sets the new password and clears the flag in one admin call, then opens the cabinet', async () => {
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow('/dashboard/barista');
    expect(mocks.updateUserById).toHaveBeenCalledWith('u1', {
      password: NEW_PASSWORD,
      app_metadata: { must_change_password: false },
    });
  });

  it('rejects a short or mismatched password without touching the account', async () => {
    await expect(
      changeTemporaryPassword(form({ password: 'short', confirmation: 'short', next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/change-password\?next=%2Fdashboard%2Fbarista&error=/);
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD + 'x', next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/change-password\?next=%2Fdashboard%2Fbarista&error=/);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it('never redirects to an external next', async () => {
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: 'https://evil.example' }))
    ).rejects.toThrow(/^\/$/);
  });

  it('without a session goes to login and changes nothing', async () => {
    mocks.user.mockReturnValue(null);
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow('/auth/login');
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it('does not let an account without the flag reset its password here', async () => {
    mocks.user.mockReturnValue({ id: 'u1', app_metadata: {} });
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow('/dashboard/barista');
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});
