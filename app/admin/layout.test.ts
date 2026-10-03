import { afterEach, describe, expect, it, vi } from 'vitest';

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: vi.fn() }));
vi.mock('next/headers', () => ({ headers: requestHeaders }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import AdminLayout from './layout';

describe('admin server layout', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('denies rendering without Basic Auth when middleware is bypassed', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'test-secret');
    requestHeaders.mockReturnValue(new Headers());
    expect(() => AdminLayout({ children: 'private admin UI' })).toThrow('redirect:/');
  });

  it('renders only after validating credentials on the server', () => {
    vi.stubEnv('ADMIN_USER', 'admin');
    vi.stubEnv('ADMIN_PASSWORD', 'test-secret');
    requestHeaders.mockReturnValue(new Headers({ authorization: `Basic ${Buffer.from('admin:test-secret').toString('base64')}` }));
    expect(AdminLayout({ children: 'private admin UI' })).toBe('private admin UI');
  });
});
