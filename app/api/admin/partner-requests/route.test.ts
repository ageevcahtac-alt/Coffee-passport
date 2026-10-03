import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { PATCH } from './[id]/route';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/adminClient', () => ({ createAdminSupabaseClient: createClient }));

function request(authorization?: string, method = 'GET') {
  return new Request('http://localhost/api/admin/partner-requests', {
    method,
    headers: authorization ? { authorization } : {},
    ...(method === 'PATCH' ? { body: JSON.stringify({ status: 'new' }) } : {}),
  });
}
const basic = (value: string) => `Basic ${Buffer.from(value).toString('base64')}`;

describe('admin handlers independently enforce Basic Auth', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_USER', 'admin');
    vi.stubEnv('ADMIN_PASSWORD', 'test-secret:with-colon');
    createClient.mockReset();
    createClient.mockReturnValue({
      from: () => ({
        select: () => ({ order: async () => ({ data: [], error: null }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead' }, error: null }) }) }) }),
      }),
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const [name, handler] of [
    ['GET', (req: Request) => GET(req)],
    ['PATCH', (req: Request) => PATCH(req, { params: { id: 'lead' } })],
  ] as const) {
    for (const authorization of [undefined, basic('admin:wrong'), basic('other:test-secret:with-colon'), 'Bearer token', 'Basic !!!', basic('admin')]) {
      it(`${name} denies ${authorization ?? 'missing authorization'} before accessing privileged data`, async () => {
        const response = await handler(request(authorization, name));
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Basic realm="Secure Admin Area"');
        expect(createClient).not.toHaveBeenCalled();
      });
    }
    it(`${name} fails closed without ADMIN_PASSWORD even for correct credentials`, async () => {
      vi.stubEnv('ADMIN_PASSWORD', '');
      expect((await handler(request(basic('admin:test-secret:with-colon'), name))).status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    });
    it(`${name} accepts valid credentials, including colons in the password`, async () => {
      expect((await handler(request(basic('admin:test-secret:with-colon'), name))).status).toBe(200);
      expect(createClient).toHaveBeenCalledOnce();
    });
  }
});
