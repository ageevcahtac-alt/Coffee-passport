import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithPassword, signUpWithPassword } from './actions';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn(), revalidate: vi.fn(), profile: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: {
  signInWithPassword: mocks.auth, signUp: mocks.auth, signOut: mocks.signOut,
}, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }) }) }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

describe('password actions return usable contextual errors', () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ error: { message: 'Invalid credentials' } });
    mocks.redirect.mockReset().mockImplementation((path: string) => { throw new Error(path); });
    mocks.revalidate.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  for (const [name, action] of [['login', signInWithPassword], ['signup', signUpWithPassword]] as const) {
    it(`${name} shows error while preserving QR context`, async () => {
      const form = new FormData();
      form.set('email', 'guest@example.test');
      form.set('password', 'invalid');
      form.set('errorRedirect', '/auth/login?next=%2Fpassport%2FX');
      await expect(action(form)).rejects.toThrow('/auth/login?next=%2Fpassport%2FX&error=Invalid+credentials');
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it(`${name} rejects a crafted external error redirect`, async () => {
      const form = new FormData();
      form.set('errorRedirect', 'https://evil.example');
      await expect(action(form)).rejects.toThrow('/?error=Invalid+credentials');
    });
    it(`${name} still returns to the selected coffee on success`, async () => {
      mocks.auth.mockResolvedValue({ error: null });
      const form = new FormData();
      form.set('next', '/passport/X');
      await expect(action(form)).rejects.toThrow('/passport/X');
      expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout');
    });
  }
});

describe('login lands staff accounts in their own cabinet', () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mocks.profile.mockReset();
    mocks.redirect.mockReset().mockImplementation((path: string) => { throw new Error(path); });
    mocks.revalidate.mockReset();
  });
  const login = (next?: string) => {
    const form = new FormData();
    form.set('email', 'owner@example.test');
    form.set('password', 'fake-password');
    if (next) form.set('next', next);
    return signInWithPassword(form);
  };
  for (const [role, path] of [
    ['admin', '/dashboard/admin'],
    ['roaster_admin', '/dashboard/roaster'],
    ['cafe_admin', '/dashboard/cafe'],
    ['barista', '/dashboard/barista'],
  ] as const) {
    it(`${role} from the default landing goes to ${path}`, async () => {
      mocks.profile.mockResolvedValue({ data: { role }, error: null });
      await expect(login('/journey')).rejects.toThrow(path);
      await expect(login('/')).rejects.toThrow(path);
      await expect(login()).rejects.toThrow(path);
    });
  }
  it('enthusiast keeps the default landing', async () => {
    mocks.profile.mockResolvedValue({ data: { role: 'enthusiast' }, error: null });
    await expect(login('/journey')).rejects.toThrow(/^\/journey$/);
  });
  it('profile lookup failure keeps the default landing', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(login('/journey')).rejects.toThrow(/^\/journey$/);
  });
  it('an explicit next wins over the role cabinet', async () => {
    mocks.profile.mockResolvedValue({ data: { role: 'cafe_admin' }, error: null });
    await expect(login('/passport/X')).rejects.toThrow(/^\/passport\/X$/);
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});

describe('login with a temporary password the cafe issued', () => {
  const login = (next?: string) => {
    const form = new FormData();
    form.set('email', 'anna@example.test');
    form.set('password', 'fake-temporary-password');
    if (next) form.set('next', next);
    return signInWithPassword(form);
  };
  const userWith = (expiresAt: string) => ({
    id: 'u1',
    app_metadata: { must_change_password: true, temporary_password_expires_at: expiresAt, cafe_id: 'shop-x', barista_id: 'barista-x' },
  });
  beforeEach(() => {
    mocks.profile.mockReset().mockResolvedValue({ data: { role: 'enthusiast' } });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.redirect.mockReset().mockImplementation((path: string) => { throw new Error(path); });
    mocks.revalidate.mockReset();
  });

  it('after 72 hours the temporary password is refused and the session is ended', async () => {
    mocks.auth.mockReset().mockResolvedValue({ data: { user: userWith('2020-01-01T00:00:00.000Z') }, error: null });
    await expect(login()).rejects.toThrow(/^\/auth\/login\?error=.*72/);
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('a valid temporary password goes straight to the password change for the barista cabinet', async () => {
    mocks.auth.mockReset().mockResolvedValue({ data: { user: userWith('2099-01-01T00:00:00.000Z') }, error: null });
    await expect(login()).rejects.toThrow('/auth/change-password?next=%2Fdashboard%2Fbarista');
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
