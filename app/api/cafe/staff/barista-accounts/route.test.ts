import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cafe creates a barista login. The signed-in profile is faked through the
// supabase server-client factory (same approach as roastery-orders), the
// service-role client through adminClient — so what is asserted is exactly
// what would reach Supabase Auth and PostgREST.

type Profile = { role: string; cafe_id: string | null; roaster_id: null; barista_id: string | null; display_name: null };
let currentUser: { id: string } | null = null;
let currentProfile: Profile | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: currentProfile, error: null }) }),
      }),
    }),
  }),
}));

const createUser = vi.fn();
const deleteUser = vi.fn();
const inserts: Record<string, unknown[]> = {};
const upserts: Record<string, unknown[]> = {};
const deletes: string[] = [];
let failTable: string | null = null;
let adminUnavailable = false;

vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => {
    if (adminUnavailable) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return {
      auth: { admin: { createUser, deleteUser } },
      from: (table: string) => ({
        insert: (row: unknown) => {
          (inserts[table] ??= []).push(row);
          return Promise.resolve({ error: failTable === table ? { message: 'boom' } : null });
        },
        upsert: (row: unknown) => {
          (upserts[table] ??= []).push(row);
          return Promise.resolve({ error: failTable === table ? { message: 'boom' } : null });
        },
        delete: () => ({
          eq: () => {
            deletes.push(table);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  },
}));

import { POST } from './route';

const CAFE_ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NEW_USER_ID = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'temporary-pass-12345';

const post = (body: unknown) =>
  new Request('http://passport.test/api/cafe/staff/barista-accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const validBody = { name: ' Анна ', email: ' Anna@Example.com ', temporaryPassword: PASSWORD };

function signInAs(role: string, cafeId: string | null = 'shop-xo-vsevolozhsk') {
  currentUser = { id: CAFE_ADMIN_ID };
  currentProfile = { role, cafe_id: cafeId, roaster_id: null, barista_id: role === 'barista' ? 'barista-x' : null, display_name: null };
}

beforeEach(() => {
  currentUser = null;
  currentProfile = null;
  failTable = null;
  adminUnavailable = false;
  createUser.mockReset();
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ error: null });
  createUser.mockResolvedValue({ data: { user: { id: NEW_USER_ID } }, error: null });
  for (const record of [inserts, upserts]) for (const key of Object.keys(record)) delete record[key];
  deletes.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/cafe/staff/barista-accounts', () => {
  it('401 without a session', async () => {
    const response = await POST(post(validBody));
    expect(response.status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('403 for a barista (only cafe_admin creates staff logins)', async () => {
    signInAs('barista');
    const response = await POST(post(validBody));
    expect(response.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates a confirmed login that must change its password, bound to the session cafe', async () => {
    signInAs('cafe_admin');
    const response = await POST(post({ ...validBody, cafe_id: 'shop-someone-else' }));
    expect(response.status).toBe(201);

    expect(createUser).toHaveBeenCalledWith({
      email: 'anna@example.com',
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { must_change_password: true },
    });
    const [baristaRow] = inserts.barista_profiles as { id: string; coffee_shop_id: string; name: string }[];
    expect(baristaRow.coffee_shop_id).toBe('shop-xo-vsevolozhsk');
    expect(baristaRow.name).toBe('Анна');
    expect(baristaRow.id).toMatch(/^barista-[0-9a-f-]{36}$/);
    expect(upserts.profiles).toEqual([
      {
        id: NEW_USER_ID,
        role: 'barista',
        cafe_id: 'shop-xo-vsevolozhsk',
        roaster_id: null,
        barista_id: baristaRow.id,
        display_name: 'Анна',
      },
    ]);

    const text = await response.text();
    expect(text).not.toContain(PASSWORD);
    expect(JSON.parse(text)).toEqual({ baristaId: baristaRow.id, email: 'anna@example.com' });
  });

  it('400 for a temporary password shorter than 12 characters', async () => {
    signInAs('cafe_admin');
    const response = await POST(post({ ...validBody, temporaryPassword: 'short-pass' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_password');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('400 for a malformed email or an empty name', async () => {
    signInAs('cafe_admin');
    expect((await POST(post({ ...validBody, email: 'not-an-email' }))).status).toBe(400);
    expect((await POST(post({ ...validBody, name: '   ' }))).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('409 when the email already has an account — never takes over an existing login', async () => {
    signInAs('cafe_admin');
    createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, code: 'email_exists', message: 'A user with this email address has already been registered' },
    });
    const response = await POST(post(validBody));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('email_exists');
    expect(upserts.profiles).toBeUndefined();
    expect(inserts.barista_profiles).toBeUndefined();
  });

  it('rolls back the new login when the profile cannot be written', async () => {
    signInAs('cafe_admin');
    failTable = 'profiles';
    const response = await POST(post(validBody));
    expect(response.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    expect(deletes).toContain('barista_profiles');
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain(PASSWORD);
  });

  it('503 admin_unavailable when the service-role key is missing (fail-closed)', async () => {
    signInAs('cafe_admin');
    adminUnavailable = true;
    const response = await POST(post(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('admin_unavailable');
  });
});
