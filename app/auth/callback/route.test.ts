import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('callback behind Nginx', () => {
  it.each(['coffeepassport.ru', '147.45.102.186'])(
    'keeps an invalid callback on public host %s', async host => {
      const response = await GET(new NextRequest('https://localhost:3000/auth/callback', { headers: { host } }));
      const location = new URL(response.headers.get('location')!);
      expect(location.origin).toBe(`https://${host}`);
      expect(location.pathname).toBe('/auth/login');
    },
  );
  it('does not trust an arbitrary Host header', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/auth/callback', { headers: { host: 'attacker.example' } }));
    expect(new URL(response.headers.get('location')!).origin).toBe('http://localhost:3000');
  });
});
