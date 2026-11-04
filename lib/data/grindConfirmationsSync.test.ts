import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrindConfirmation } from './grindConfirmationsStore';

// Phase 3 sync matrix (0038): online/offline push, login-time pull-merge
// with dedup, parked-row retry, anonymous no-op. No jsdom in this project —
// the stores only touch window.localStorage, so a minimal in-memory
// stand-in suffices (same convention as lib/journey/store.test.ts).
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

// The Supabase stand-in is scripted per test: `fetchRows` answers the
// pull's select('*'), `insertResult` decides the push outcome (error
// object = server rejection, throw = network down), and every inserted row
// lands in `inserted` for assertions.
const inserted: { table: string; row: Record<string, unknown> }[] = [];
let fetchRows: Record<string, unknown>[] = [];
let fetchError: { message: string } | null = null;
let insertResult: { error: { message: string } | null; data: unknown } = { error: null, data: { id: 'srv-new' } };
let insertThrows = false;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        if (insertThrows) throw new Error('network down');
        const result = insertResult;
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
    id: 'local-1',
    fromModel: 'Comandante C40',
    fromSetting: '24 клик',
    toModel: 'Timemore C2/C3',
    toSetting: '20',
    brewingMethodId: 'v60',
    createdAt: '2026-11-03T00:00:00.000Z',
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
  insertResult = { error: null, data: { id: 'srv-new' } };
  insertThrows = false;
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('lib/data/grindConfirmationsSync — push matrix', () => {
  it('online push writes the full conversion row and stamps serverId on the local record', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    seed([confirmation({ lotId: 'LOT-PUBLIC-1' })]);

    const ok = await pushGrindConfirmation(getSnapshot()[0], 'user-1');

    expect(ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('grind_confirmations');
    expect(inserted[0].row).toEqual({
      owner_user_id: 'user-1',
      from_model: 'Comandante C40',
      to_model: 'Timemore C2/C3',
      brewing_method: 'v60',
      from_setting: '24 клик',
      to_setting: '20',
      lot_id: 'LOT-PUBLIC-1',
    });
    expect(stored()[0]).toMatchObject({ serverId: 'srv-new', syncPendingFor: null });
  });

  it('server rejection parks the row for the next login retry', async () => {
    const { getSnapshot } = await import('./grindConfirmationsStore');
    const { pushGrindConfirmation } = await import('./grindConfirmationsSync');
    insertResult = { error: { message: 'row violates rls' }, data: null };
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

  it('pull merges server-only rows and dedups by serverId and by local id', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    fetchRows = [
      {
        id: 'srv-already',
        owner_user_id: 'user-1',
        from_model: 'Comandante C40',
        to_model: 'Timemore C2/C3',
        brewing_method: 'v60',
        from_setting: '24 клик',
        to_setting: '20',
        lot_id: 'LOT-PUBLIC-1',
        created_at: '2026-11-03T10:00:00.000Z',
      },
      {
        id: 'srv-fresh',
        owner_user_id: 'user-1',
        from_model: 'Mahlkönig EK43',
        to_model: 'Fellow Ode',
        brewing_method: 'v60',
        from_setting: '7.2',
        to_setting: '5.5',
        lot_id: 'LOT-PUBLIC-2',
        created_at: '2026-11-03T11:00:00.000Z',
      },
    ];
    // Local cache already knows srv-already under a local id of its own —
    // a second device pushed it; the pull must not duplicate it.
    seed([confirmation({ id: 'local-dev1', serverId: 'srv-already' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    const all = stored();
    expect(all).toHaveLength(2);
    const fresh = all.find((c) => c.serverId === 'srv-fresh');
    expect(fresh).toMatchObject({
      id: 'grindconf-server-srv-fresh',
      fromModel: 'Mahlkönig EK43',
      fromSetting: '7.2',
      toModel: 'Fellow Ode',
      toSetting: '5.5',
      brewingMethodId: 'v60',
      lotId: 'LOT-PUBLIC-2',
    });
    // Nothing was pushed: both server rows are known, nothing is parked.
    expect(inserted).toHaveLength(0);
  });

  it('a parked row (offline at save time) is retried on the next login', async () => {
    const { syncGrindConfirmationsForUser } = await import('./grindConfirmationsSync');
    fetchRows = [];
    seed([confirmation({ syncPendingFor: 'user-1' })]);

    await syncGrindConfirmationsForUser('user-1', true);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('grind_confirmations');
    // Retry succeeded — the park mark is cleared and serverId stamped.
    expect(stored()[0]).toMatchObject({ serverId: 'srv-new', syncPendingFor: null });
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
