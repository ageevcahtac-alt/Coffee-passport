import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeQuery, type FakeResult } from '@/lib/testing/fakeSupabase';

const { createClient, mocks } = vi.hoisted(() => ({
  createClient: vi.fn(),
  mocks: { user: vi.fn(), profile: vi.fn() },
}));
vi.mock('@/lib/supabase/adminClient', () => ({ createAdminSupabaseClient: createClient }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user() } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profile() }) }) }) }),
  }),
}));
import { PUT } from './route';

const profile = (role: string, cafe_id: string | null = 'shop-xo-vsevolozhsk') =>
  ({ role, cafe_id, roaster_id: null, barista_id: null, display_name: null });
const put = (body: unknown) =>
  new Request('http://localhost/api/cafe/map-profile', { method: 'PUT', body: JSON.stringify(body) });
const form = {
  id: 'shop-other', status: 'paused', brandColor: '#000000', slug: 'evil',
  name: 'XO Coffee', city: 'Всеволожск', address: 'Колтушское ш., 1', phone: '', website: '', instagramUrl: '',
  telegramUrl: '', vkUrl: '', description: 'Пилот', workingHours: '8–20', photos: ['data:image/jpeg;base64,AA'], lat: 60.01, lng: 30.63,
};

let existing: Record<string, unknown> | null;
let db: ReturnType<typeof fakeSupabase>;
function handler(query: FakeQuery): FakeResult {
  if (query.op === 'select') return { data: existing, error: null };
  return { data: { id: 'uuid', slug: query.filters.slug ?? (query.payload as { slug: string }).slug, ...(query.payload as object) }, error: null };
}

beforeEach(() => {
  mocks.user.mockReset().mockReturnValue({ id: 'u1', app_metadata: {} });
  mocks.profile.mockReset().mockReturnValue(profile('cafe_admin'));
  existing = null;
  db = fakeSupabase(handler);
  createClient.mockReset().mockReturnValue(db.client);
});

describe('PUT /api/cafe/map-profile', () => {
  it('writes the profile of the session cafe, ignoring id / status / colour from the body', async () => {
    existing = { slug: 'shop-xo-vsevolozhsk' };
    const response = await PUT(put(form));
    expect(response.status).toBe(200);
    const [update] = db.calls.filter((call) => call.op === 'update');
    expect(update.filters).toEqual({ slug: 'shop-xo-vsevolozhsk' });
    expect(update.payload).toMatchObject({ address: 'Колтушское ш., 1', lat: 60.01, lng: 30.63, photos: form.photos });
    for (const key of ['slug', 'status', 'brand_color', 'partner_request_id']) expect(update.payload).not.toHaveProperty(key);
  });

  it('creates the row from the built-in card when the cafe is not in the database yet', async () => {
    const response = await PUT(put(form));
    expect(response.status).toBe(200);
    const [insert] = db.calls.filter((call) => call.op === 'insert');
    expect(insert.payload).toMatchObject({ slug: 'shop-xo-vsevolozhsk', status: 'active', brand_color: '#D4AF37', lat: 60.01 });
  });

  it('rejects a half-set point and a non-image photo', async () => {
    expect((await PUT(put({ ...form, lng: null }))).status).toBe(400);
    expect((await PUT(put({ ...form, photos: ['javascript:alert(1)'] }))).status).toBe(400);
  });

  it('403 for a barista or a cafe account without cafe_id, before touching data', async () => {
    mocks.profile.mockReturnValue(profile('barista'));
    expect((await PUT(put(form))).status).toBe(403);
    mocks.profile.mockReturnValue(profile('cafe_admin', null));
    expect((await PUT(put(form))).status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });
});
