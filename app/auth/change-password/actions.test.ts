import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeTemporaryPassword } from './actions';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  updateUserById: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
  signOut: vi.fn(),
  writes: [] as { table: string; op: string; payload: unknown; order: number }[],
  cards: [] as { id: string; coffee_shop_id: string }[],
  failProfiles: false,
  order: 0,
  fresh: { must_change_password: false } as Record<string, unknown>,
  before: {} as Record<string, unknown>,
  reads: 0,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }), signInWithPassword: mocks.signIn, signOut: mocks.signOut },
  }),
}));
vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => ({
    auth: {
      admin: {
        updateUserById: mocks.updateUserById,
        // First read (before the password is set) sees the auth state at that
        // moment, the second one (after the grant) sees `fresh`.
        getUserById: async () => ({
          data: { user: { id: 'u1', app_metadata: mocks.reads++ === 0 ? mocks.before : mocks.fresh } },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const write = (op: string) => (payload: unknown) => {
        mocks.writes.push({ table, op, payload, order: ++mocks.order });
        const result = { error: mocks.failProfiles && table === 'profiles' ? { message: 'boom' } : null };
        // upsert(...) is awaited directly, update(...).eq(...) one step later.
        return Object.assign(Promise.resolve(result), { eq: () => Promise.resolve(result) });
      };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => ((filters[column] = value), builder),
        maybeSingle: async () => ({
          data: mocks.cards.find((card) => Object.entries(filters).every(([k, v]) => (card as Record<string, unknown>)[k] === v)) ?? null,
          error: null,
        }),
        upsert: write('upsert'),
        update: write('update'),
      };
      return builder;
    },
  }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const NEW_PASSWORD = 'my-own-password-2026';
const PENDING = {
  must_change_password: true,
  temporary_password_expires_at: '2099-01-01T00:00:00.000Z',
  cafe_id: 'shop-xo-vsevolozhsk',
  barista_id: 'barista-anna',
};

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
    mocks.updateUserById.mockReset().mockImplementation(async () => {
      mocks.writes.push({ table: 'auth.users', op: 'updateUserById', payload: null, order: ++mocks.order });
      return { data: { user: {} }, error: null };
    });
    mocks.writes.length = 0;
    mocks.cards = [{ id: 'barista-anna', coffee_shop_id: 'shop-xo-vsevolozhsk' }];
    mocks.failProfiles = false;
    mocks.fresh = { must_change_password: false };
    mocks.before = PENDING;
    mocks.reads = 0;
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.user.mockReset().mockReturnValue({ id: 'u1', email: 'anna@example.com', app_metadata: PENDING });
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
      app_metadata: { must_change_password: false, temporary_password_expires_at: null },
    });
  });

  // Codex review PR #25: rights granted before the password change left a
  // window where the temporary password already held them.
  it('grants barista rights only AFTER the own password replaced the temporary one', async () => {
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow('/dashboard/barista');
    const grant = mocks.writes.find((write) => write.table === 'profiles');
    expect(grant?.payload).toEqual({
      id: 'u1',
      role: 'barista',
      cafe_id: 'shop-xo-vsevolozhsk',
      roaster_id: null,
      barista_id: 'barista-anna',
    });
    const passwordSet = mocks.writes.find((write) => write.op === 'updateUserById');
    expect(passwordSet!.order).toBeLessThan(grant!.order);
  });

  it('grants nothing when the password cannot be saved', async () => {
    mocks.updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 422, code: 'weak_password' } });
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/change-password\?/);
    expect(mocks.writes.filter((write) => write.table === 'profiles')).toEqual([]);
  });

  // Codex review PR #25: the cafe re-issued a temporary password between our
  // password change and the grant — the new temporary password must not end
  // up holding barista rights.
  it('takes the rights back when a re-issue landed between the password change and the grant', async () => {
    mocks.fresh = { must_change_password: true };
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/login\?next=%2Fdashboard%2Fbarista&error=/);
    expect(mocks.writes.filter((write) => write.table === 'profiles').map((write) => write.payload)).toEqual([
      { id: 'u1', role: 'barista', cafe_id: 'shop-xo-vsevolozhsk', roaster_id: null, barista_id: 'barista-anna' },
      { role: 'enthusiast', cafe_id: null, barista_id: null },
    ]);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  // Codex review PR #25 round 2: a request started with the old temporary
  // password must not overwrite one the cafe re-issued meanwhile.
  it('a stale request does not overwrite a temporary password the cafe re-issued meanwhile', async () => {
    mocks.before = { ...PENDING, temporary_password_expires_at: '2099-02-01T00:00:00.000Z' };
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/login\?next=%2Fdashboard%2Fbarista&error=/);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });

  it('if the grant fails after the password is saved, sends to login (the next login finishes the grant)', async () => {
    mocks.failProfiles = true;
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/login\?next=%2Fdashboard%2Fbarista&error=/);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('refuses when the barista card no longer belongs to that cafe', async () => {
    mocks.cards = [];
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/change-password\?/);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });

  it('an expired temporary password (72 h) changes nothing and ends the session', async () => {
    mocks.user.mockReturnValue({
      id: 'u1',
      email: 'anna@example.com',
      app_metadata: { ...PENDING, temporary_password_expires_at: '2020-01-01T00:00:00.000Z' },
    });
    await expect(
      changeTemporaryPassword(form({ password: NEW_PASSWORD, confirmation: NEW_PASSWORD, next: '/dashboard/barista' }))
    ).rejects.toThrow(/^\/auth\/login\?next=%2Fdashboard%2Fbarista&error=.*72/);
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
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
