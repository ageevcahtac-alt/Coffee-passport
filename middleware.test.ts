import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase SSR обновляет токен внутри getUser() и отдаёт новые cookie через setAll —
// middleware обязан донести их и до запроса (серверный рендер), и до браузера.
const { getUser, captured } = vi.hoisted(() => ({
  getUser: vi.fn(),
  captured: { cookies: null as null | { getAll: () => unknown; setAll: (c: unknown[]) => void } },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: typeof captured.cookies }) => {
    captured.cookies = options.cookies;
    return { auth: { getUser } };
  },
}));

const { middleware, config } = await import('./middleware');

describe('session middleware', () => {
  beforeEach(() => {
    getUser.mockReset();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test/supabase');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon');
  });

  it('refreshes the session and writes the rotated token to the response and the request', async () => {
    getUser.mockImplementation(async () => {
      captured.cookies!.setAll([{ name: 'sb-x-auth-token', value: 'rotated', options: { path: '/', maxAge: 400 } }]);
      return { data: { user: { id: 'u1' } } };
    });
    const request = new NextRequest('https://example.test/', { headers: { cookie: 'sb-x-auth-token=old' } });
    const response = await middleware(request);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(response.cookies.get('sb-x-auth-token')?.value).toBe('rotated');
    expect(response.cookies.get('sb-x-auth-token')?.maxAge).toBe(400);
    expect(request.cookies.get('sb-x-auth-token')?.value).toBe('rotated');
  });

  it('reads cookies of the request', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await middleware(new NextRequest('https://example.test/', { headers: { cookie: 'sb-x-auth-token=old' } }));
    expect(captured.cookies!.getAll()).toEqual([{ name: 'sb-x-auth-token', value: 'old' }]);
  });

  it('skips static files, images and map tiles', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ['/_next/static/chunks/a.js', '/_next/image', '/favicon.ico', '/tiles/1/2/3.png', '/images/four-philosophies/beans.png']) {
      expect(matcher.test(path), path).toBe(false);
    }
    for (const path of ['/', '/journey', '/dashboard/cafe', '/passport/lot-1']) {
      expect(matcher.test(path), path).toBe(true);
    }
  });
});
