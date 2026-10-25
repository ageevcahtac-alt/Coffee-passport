import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cafe creates, lists and re-issues barista logins. The signed-in profile is
// faked through the supabase server-client factory (same approach as
// roastery-orders), the service-role client through adminClient — so what is
// asserted is exactly what would reach Supabase Auth and PostgREST.

type Profile = { role: string; cafe_id: string | null; roaster_id: null; barista_id: string | null; display_name: null };
let currentUser: { id: string; app_metadata?: Record<string, unknown> } | null = null;
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

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

const createUser = vi.fn();
const deleteUser = vi.fn();
const updateUserById = vi.fn();
const listUsers = vi.fn();
let calls: Call[] = [];
let tables: Record<string, Row[]> = {};
let failOps = new Set<string>();
let adminUnavailable = false;

// Minimal PostgREST builder: records every write, answers selects from
// `tables` filtered by the .eq() calls.
function from(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const settle = (single: boolean) => {
    calls.push(call);
    if (failOps.has(`${table}.${call.op}`)) return Promise.resolve({ data: null, error: { message: 'boom' } });
    if (call.op !== 'select') return Promise.resolve({ data: null, error: null });
    const rows = (tables[table] ?? []).filter((row) => call.filters.every(([column, value]) => row[column] === value));
    return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null });
  };
  const builder = {
    select: () => builder,
    insert: (payload: unknown) => Object.assign(call, { op: 'insert', payload }) && builder,
    upsert: (payload: unknown) => Object.assign(call, { op: 'upsert', payload }) && builder,
    update: (payload: unknown) => Object.assign(call, { op: 'update', payload }) && builder,
    delete: () => Object.assign(call, { op: 'delete' }) && builder,
    eq: (column: string, value: unknown) => {
      call.filters.push([column, value]);
      return builder;
    },
    maybeSingle: () => settle(true),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => settle(false).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => {
    if (adminUnavailable) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return { auth: { admin: { createUser, deleteUser, updateUserById, listUsers } }, from };
  },
}));

import { GET, PATCH, POST } from './route';

const CAFE = 'shop-xo-vsevolozhsk';
const CAFE_ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NEW_USER_ID = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'temporary-pass-12345';
const HOUR = 60 * 60 * 1000;

const request = (method: string, body?: unknown) =>
  new Request('http://passport.test/api/cafe/staff/barista-accounts', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = (body: unknown) => request('POST', body);
const patch = (body: unknown) => request('PATCH', body);

const validBody = { name: ' Анна ', email: ' Anna@Example.com ', temporaryPassword: PASSWORD };

function signInAs(role: string, cafeId: string | null = CAFE) {
  currentUser = { id: CAFE_ADMIN_ID };
  currentProfile = { role, cafe_id: cafeId, roaster_id: null, barista_id: role === 'barista' ? 'barista-x' : null, display_name: null };
}

const writes = (table: string, op: string) => calls.filter((call) => call.table === table && call.op === op);

beforeEach(() => {
  currentUser = null;
  currentProfile = null;
  calls = [];
  tables = {};
  failOps = new Set();
  adminUnavailable = false;
  for (const fn of [createUser, deleteUser, updateUserById, listUsers]) fn.mockReset();
  deleteUser.mockResolvedValue({ error: null });
  updateUserById.mockImplementation(async () => {
    calls.push({ table: 'auth.users', op: 'updateUserById', filters: [] });
    return { data: { user: {} }, error: null };
  });
  listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  createUser.mockResolvedValue({ data: { user: { id: NEW_USER_ID } }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useRealTimers();
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

  it('creates a login with a 72-hour temporary password and NO barista rights until the password change', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T10:00:00Z') });
    signInAs('cafe_admin');
    const response = await POST(post({ ...validBody, cafe_id: 'shop-someone-else' }));
    expect(response.status).toBe(201);

    const [baristaRow] = writes('barista_profiles', 'insert').map((call) => call.payload) as {
      id: string;
      coffee_shop_id: string;
      name: string;
    }[];
    expect(baristaRow.coffee_shop_id).toBe(CAFE);
    expect(baristaRow.name).toBe('Анна');
    expect(baristaRow.id).toMatch(/^barista-[0-9a-f-]{36}$/);

    expect(createUser).toHaveBeenCalledWith({
      email: 'anna@example.com',
      password: PASSWORD,
      email_confirm: true,
      app_metadata: {
        must_change_password: true,
        temporary_password_expires_at: '2026-10-28T10:00:00.000Z',
        cafe_id: CAFE,
        barista_id: baristaRow.id,
      },
    });
    // RLS and the loyalty RPCs look only at profiles.role — an enthusiast
    // profile is what keeps the API closed before the password change.
    expect(writes('profiles', 'upsert').map((call) => call.payload)).toEqual([
      { id: NEW_USER_ID, role: 'enthusiast', cafe_id: null, roaster_id: null, barista_id: null, display_name: 'Анна' },
    ]);

    const text = await response.text();
    expect(text).not.toContain(PASSWORD);
    expect(JSON.parse(text)).toEqual({
      baristaId: baristaRow.id,
      email: 'anna@example.com',
      expiresAt: '2026-10-28T10:00:00.000Z',
    });
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
    expect(writes('profiles', 'upsert')).toEqual([]);
    expect(writes('barista_profiles', 'insert')).toEqual([]);
  });

  it('rolls back the new login when the profile cannot be written', async () => {
    signInAs('cafe_admin');
    failOps.add('profiles.upsert');
    const response = await POST(post(validBody));
    expect(response.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    expect(writes('barista_profiles', 'delete')).toHaveLength(1);
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

describe('GET /api/cafe/staff/barista-accounts', () => {
  const now = Date.parse('2026-10-25T10:00:00Z');
  const pending = (id: string, baristaId: string, expiresAt: string, cafeId = CAFE) => ({
    id,
    email: `${id}@example.com`,
    created_at: '2026-10-20T00:00:00Z',
    app_metadata: { must_change_password: true, temporary_password_expires_at: expiresAt, cafe_id: cafeId, barista_id: baristaId },
  });

  beforeEach(() => {
    vi.useFakeTimers({ now });
    tables = {
      barista_profiles: [
        { id: 'barista-active', coffee_shop_id: CAFE, name: 'Вера' },
        { id: 'barista-pending', coffee_shop_id: CAFE, name: 'Анна' },
        { id: 'barista-expired', coffee_shop_id: CAFE, name: 'Борис' },
        { id: 'barista-other', coffee_shop_id: 'shop-other', name: 'Чужой' },
      ],
      profiles: [
        { id: 'u-active', role: 'barista', cafe_id: CAFE, barista_id: 'barista-active' },
        { id: 'u-other', role: 'barista', cafe_id: 'shop-other', barista_id: 'barista-other' },
      ],
    };
    listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'u-active', email: 'vera@example.com', created_at: '2026-10-01T00:00:00Z', app_metadata: { must_change_password: false } },
          pending('u-pending', 'barista-pending', new Date(now + HOUR).toISOString()),
          pending('u-expired', 'barista-expired', new Date(now - HOUR).toISOString()),
          pending('u-foreign', 'barista-other', new Date(now + HOUR).toISOString(), 'shop-other'),
          { id: 'u-guest', email: 'guest@example.com', created_at: '2026-10-01T00:00:00Z', app_metadata: {} },
        ],
      },
      error: null,
    });
  });

  it('403 for a barista', async () => {
    signInAs('barista');
    expect((await GET()).status).toBe(403);
  });

  it('lists only this cafe’s logins with their temporary-password status', async () => {
    signInAs('cafe_admin');
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).accounts).toEqual([
      { baristaId: 'barista-pending', name: 'Анна', email: 'u-pending@example.com', status: 'pending', expiresAt: new Date(now + HOUR).toISOString() },
      { baristaId: 'barista-expired', name: 'Борис', email: 'u-expired@example.com', status: 'expired', expiresAt: new Date(now - HOUR).toISOString() },
      { baristaId: 'barista-active', name: 'Вера', email: 'vera@example.com', status: 'active', expiresAt: null },
    ]);
  });
});

describe('PATCH /api/cafe/staff/barista-accounts (new temporary password)', () => {
  const now = Date.parse('2026-10-25T10:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ now });
    tables = {
      barista_profiles: [
        { id: 'barista-active', coffee_shop_id: CAFE, name: 'Вера' },
        { id: 'barista-expired', coffee_shop_id: CAFE, name: 'Борис' },
        { id: 'barista-other', coffee_shop_id: 'shop-other', name: 'Чужой' },
      ],
      profiles: [{ id: 'u-active', role: 'barista', cafe_id: CAFE, barista_id: 'barista-active' }],
    };
    listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'u-active', email: 'vera@example.com', app_metadata: { must_change_password: false } },
          {
            id: 'u-expired',
            email: 'boris@example.com',
            app_metadata: { must_change_password: true, temporary_password_expires_at: '2026-10-20T00:00:00Z', cafe_id: CAFE, barista_id: 'barista-expired' },
          },
        ],
      },
      error: null,
    });
  });

  const expectedMetadata = (baristaId: string) => ({
    must_change_password: true,
    temporary_password_expires_at: '2026-10-28T10:00:00.000Z',
    cafe_id: CAFE,
    barista_id: baristaId,
  });

  it('re-issues an expired temporary password for 72 hours', async () => {
    signInAs('cafe_admin');
    const response = await PATCH(patch({ baristaId: 'barista-expired', temporaryPassword: PASSWORD }));
    expect(response.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith('u-expired', { password: PASSWORD, app_metadata: expectedMetadata('barista-expired') });
    const text = await response.text();
    expect(text).not.toContain(PASSWORD);
    expect(JSON.parse(text)).toEqual({ baristaId: 'barista-expired', email: 'boris@example.com', expiresAt: '2026-10-28T10:00:00.000Z' });
  });

  it('takes barista rights away from an active login BEFORE the new temporary password is set', async () => {
    signInAs('cafe_admin');
    const response = await PATCH(patch({ baristaId: 'barista-active', temporaryPassword: PASSWORD }));
    expect(response.status).toBe(200);
    const demote = writes('profiles', 'update');
    expect(demote.map((call) => [call.payload, call.filters])).toEqual([
      [{ role: 'enthusiast', cafe_id: null, barista_id: null }, [['id', 'u-active']]],
    ]);
    const passwordSet = calls.findIndex((call) => call.op === 'updateUserById');
    expect(calls.indexOf(demote[0])).toBeLessThan(passwordSet);
    expect(updateUserById).toHaveBeenCalledWith('u-active', { password: PASSWORD, app_metadata: expectedMetadata('barista-active') });
  });

  it('restores barista rights when the password update fails', async () => {
    signInAs('cafe_admin');
    updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 500, code: 'unexpected_failure' } });
    const response = await PATCH(patch({ baristaId: 'barista-active', temporaryPassword: PASSWORD }));
    expect(response.status).toBe(500);
    expect(writes('profiles', 'update').map((call) => call.payload)).toEqual([
      { role: 'enthusiast', cafe_id: null, barista_id: null },
      { role: 'barista', cafe_id: CAFE, barista_id: 'barista-active' },
    ]);
  });

  it('404 for another cafe’s barista — never touches its login', async () => {
    signInAs('cafe_admin');
    const response = await PATCH(patch({ baristaId: 'barista-other', temporaryPassword: PASSWORD }));
    expect(response.status).toBe(404);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(writes('profiles', 'update')).toEqual([]);
  });

  it('400 for a short password, 403 for a barista', async () => {
    signInAs('cafe_admin');
    expect((await PATCH(patch({ baristaId: 'barista-expired', temporaryPassword: 'short' }))).status).toBe(400);
    signInAs('barista');
    expect((await PATCH(patch({ baristaId: 'barista-expired', temporaryPassword: PASSWORD }))).status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
