import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithPassword, signUpWithPassword } from './actions';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: {
  signInWithPassword: mocks.auth, signUp: mocks.auth,
} }) }));
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
