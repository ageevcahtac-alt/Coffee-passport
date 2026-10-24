import { describe, expect, it } from 'vitest';
import { authErrorPath, safeNextPath } from './safeRedirect';

describe('contextual auth errors', () => {
  it('preserves the passport next param separately from the error', () => {
    const path = authErrorPath('/auth/login?next=%2Fpassport%2FX', 'Неверный пароль? & retry');
    const url = new URL(path, 'http://local');
    expect(url.searchParams.get('next')).toBe('/passport/X');
    expect(url.searchParams.get('error')).toBe('Неверный пароль? & retry');
    expect([...url.searchParams.keys()]).toEqual(['next', 'error']);
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example'])('keeps external error target %s local', (target) => {
    const url = new URL(authErrorPath(target, 'bad password'), 'http://local');
    expect(url.origin).toBe('http://local');
    expect(url.pathname).toBe('/');
  });
});

describe('safeNextPath rejects paths a browser resolves to another host', () => {
  const backslash = String.fromCharCode(92);
  for (const next of [`/${backslash}evil.example`, `/${backslash}/evil.example`, '/\tevil', '/\nevil', '//evil.example']) {
    it(`${JSON.stringify(next)} -> /`, () => {
      expect(safeNextPath(next)).toBe('/');
    });
  }
  it('keeps ordinary in-app paths with a query', () => {
    expect(safeNextPath('/dashboard/barista?tab=loyalty')).toBe('/dashboard/barista?tab=loyalty');
  });
});
