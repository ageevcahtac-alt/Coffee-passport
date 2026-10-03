import { describe, expect, it } from 'vitest';
import { authErrorPath } from './safeRedirect';

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
