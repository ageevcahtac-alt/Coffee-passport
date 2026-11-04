import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrindConfirmation } from './grindConfirmationsStore';

// Phase 3 sync matrix (0038): online/offline push, idempotent retries,
// login-time pull-merge with dedup, parked-row retry, anonymous no-op.
// No jsdom in this project — the stores only touch window.localStorage, so
// a minimal in-memory stand-in suffices (same convention as
// lib/journey/store.test.ts).
//
// The store module keeps a module-level read cache, so like store.test.ts
// every test imports fresh modules (vi.resetModules + dynamic import) —
// a static import would leak one test's cache into the next.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const STORAGE_KEY = 'coffee-passport:grind-confirmations';
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Supabase stand-in is scripted per test: `fetchRows` answers the
// pull's select('*'), `insertResult` decides the push outcome (error
// object = server rejection, throw = network down), and every inserted row
// lands in `inserted` for assertions.
const inserted: { table: string; row: Record<string, unknown> }[] = [];
let fetchRows: Record<string, unknown>[] = [];
let fetchError: { message: string } | null = null;
// null = the happy path: PostgREST echoes the inserted row's own columns,
// so .select('id').single() returns the primary key the client sent.
let insertResult: { error: { message: string; code?: string } | null; data: unknown } | null = null;
let insertThrows = false;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        if (insertThrows) throw new Error('network down');
        const result = insertResult ?? { error: null, data: { id: row.id } };
        return {
          select: () => ({
            single: () => Promise.resolve(result),
          }),
        };
      },
      select: () => ({
        eq: () => {
          if (fetchError) return Promise.resolve({ data: null, error: fetchError });
          return Promise.resolve({ data: fetchRows, error: null });
        },
      }),
    }),
  }),
}));

function confirmation(overrides: Partial<GrindConfirmation> = {}): GrindConfirmation {
  return {
    id: UUID_A,
    fromModel: 'Comandante C40',
    fromSetting: '24 клик',
    toModel: 'Timemore C2/C3',
    toSetting: '20',
    brewingMethodId: 'v60',
    createdAt: '2026-11-03T00:00:00.000Z',
    ...overrides,
  };
}

function serverRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID_B,
    owner_user_id: 'user-1',
    from_model: 'Comandante C40',
    to_model: 'Timemore C2/C3',
    brewing_method: 'v60',
    from_setting: '24 клик',
    to_setting: '20',
    lot_id: 'LOT-PUBLIC-1',
    created_at: '2026-11-03T10:00:00.000Z',
    ...overrides,
  };
}

function stored(): GrindConfirmation[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as GrindConfirmation[]) : [];
}

function seed(confirmations: GrindConfirmation[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(confirmations));
}

beforeEach(() => {
  vi.resetModules();
  inserted.length = 0;
  fetchRows = [];
  fetchError = null;
  insertResult = null;
  insertThrows = false;
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('lib/data/grindConfirmationsSync — push matrix', () => {
  it('online push sends the local UUID as the row primary key and stamps serverId', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    seed([confirmation({ lotId: 'LOT-PUBLIC-1' })]);

    const ok = await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    expect(ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('grind_confirmations');
    expect(inserted[0].row).toEqual({
      id: UUID_A,
      owner_user_id: 'user-1',
      from_model: 'Comandante C40',
      to_model: 'Timemore C2/C3',
      brewing_method: 'v60',
      from_setting: '24 клик',
      to_setting: '20',
      lot_id: 'LOT-PUBLIC-1',
    });
    expect(stored()[0]).toMatchObject({ serverId: UUID_A, syncPendingFor: null });
  });

  it('a retry after a lost response (unique violation) links the committed row instead of parking', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    insertResult = { error: { message: 'duplicate key value violates pk', code: '23505' }, data: null };
    seed([confirmation({ syncPendingFor: 'user-1' })]);

    const ok = await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    expect(ok).toBe(true);
    // The row we sent IS the primary key — no duplicate, no park mark.
    expect(stored()[0]).toMatchObject({ serverId: UUID_A, syncPendingFor: null });
  });

  it('a pre-sync row with a non-UUID id mints one, persists it, and pushes under it', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    seed([confirmation({ id: 'grindconf-legacy-1' })]);

    await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    const row = inserted[0].row;
    expect(String(row.id)).toMatch(UUID_RE);
    expect(row.id).not.toBe('grindconf-legacy-1');
    // Persisted under the new key, so every retry replays the same INSERT.
    expect(stored()[0].id).toBe(row.id);
    expect(stored()[0]).toMatchObject({ serverId: row.id, syncPendingFor: null });
  });

  it('server rejection parks the row for the next login retry', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    insertResult = { error: { message: 'row violates rls', code: '42501' }, data: null };
    seed([confirmation()]);

    const ok = await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    expect(ok).toBe(false);
    expect(stored()[0]).toMatchObject({ syncPendingFor: 'user-1' });
    expect(stored()[0].serverId).toBeUndefined(); // never pushed — no server echo
  });

  it('offline push (thrown request) parks the row the same way', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    insertThrows = true;
    seed([confirmation()]);

    const ok = await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    expect(ok).toBe(false);
    expect(stored()[0]).toMatchObject({ syncPendingFor: 'user-1' });
  });

  it('a legacy local row without lotId pushes an empty lot_id, never null', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    seed([confirmation({ lotId: undefined })]);

    await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    expect(inserted[0].row.lot_id).toBe('');
  });
});

describe('lib/data/grindConfirmationsSync — login sync', () => {
  it('anonymous browsing is a no-op — no fetch, no push', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    seed([confirmation({ syncPendingFor: 'anon-device' })]);

    await syncGrindConfirmationsForUser('anon-device', false);

    expect(inserted).toHaveLength(0);
  });

  it('pull merges server-only rows and dedups by serverId', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    fetchRows = [serverRow({ id: 'srv-already' }), serverRow({ id: 'srv-fresh', from_model: 'Mahlkönig EK43' })];
    // Local cache already knows srv-already — a second device pushed it;
    // the pull must not duplicate it.
    seed([confirmation({ id: UUID_A, serverId: 'srv-already' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    const all = stored();
    expect(all).toHaveLength(2);
    const fresh = all.find((c) => c.serverId === 'srv-fresh');
    expect(fresh).toMatchObject({
      id: 'srv-fresh',
      fromModel: 'Mahlkönig EK43',
      brewingMethodId: 'v60',
      lotId: 'LOT-PUBLIC-1',
    });
    // Nothing was pushed: both server rows are known, nothing is parked.
    expect(inserted).toHaveLength(0);
  });

  it('a parked row whose push committed (lost response) is relinked by primary key, not re-pushed', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    // The INSERT committed but the response never reached the device — the
    // server row carries the SAME primary key the pusher sent.
    fetchRows = [serverRow({ id: UUID_A })];
    seed([confirmation({ syncPendingFor: 'user-1' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    // Linked locally, never re-inserted — a duplicate would double-count
    // the confirmation and skew the community median.
    expect(inserted).toHaveLength(0);
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ serverId: UUID_A, syncPendingFor: null });
  });

  it('a server row with identical content but a DIFFERENT id is not stolen (Codex round 2)', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    // Another tasting (here: another device) logged the exact same
    // conversion for the same lot. Content equality proves nothing about
    // ownership — the parked row must still be pushed under its own id.
    fetchRows = [serverRow({ id: UUID_B })];
    seed([confirmation({ id: UUID_A, syncPendingFor: 'user-1' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].row.id).toBe(UUID_A);
    expect(stored().some((c) => c.serverId === UUID_B)).toBe(true); // merged, not stolen
    expect(stored().some((c) => c.serverId === UUID_A)).toBe(true); // pushed and stamped
  });

  it('a parked row facing no matching server row stays parked until the retry pushes it', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    fetchRows = [];
    seed([confirmation({ syncPendingFor: 'user-1' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].row.id).toBe(UUID_A);
    expect(stored()[0]).toMatchObject({ serverId: UUID_A, syncPendingFor: null });
  });

  it('a park mark left by a different user is not retried under this login', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    fetchRows = [];
    seed([confirmation({ syncPendingFor: 'someone-else' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    expect(inserted).toHaveLength(0);
    expect(stored()[0].syncPendingFor).toBe('someone-else');
  });

  it('a fetch failure leaves the local cache standing, parked rows untouched', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    fetchError = { message: 'relation does not exist' };
    seed([confirmation({ syncPendingFor: 'user-1' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    expect(inserted).toHaveLength(0);
    expect(stored()[0].syncPendingFor).toBe('user-1');
  });
});
