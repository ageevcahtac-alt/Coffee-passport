import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const insertedRows: { table: string; row: unknown }[] = [];

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertedRows.push({ table, row });
        return Promise.resolve({ error: null, data: null });
      },
    }),
  }),
}));

vi.mock('@/lib/data/canonicalLotStore', () => ({
  findCanonicalLotByPublicId: vi.fn(async () => null),
  getActiveReferenceTasteProfile: vi.fn(async () => null),
}));

const LOT = { id: 'LOT-XO-COL-004', roasterId: 'roaster-xo' };
const VALID = { acidity: 3, sweetness: 4, body: 3, overall: 5, brew: 'v60', note: 'Ягоды и карамель', id: 'oi-42' };

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('lib/journey/xoStoreImport', () => {
  beforeEach(() => {
    vi.resetModules();
    insertedRows.length = 0;
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  describe('validation', () => {
    it('round-trips a valid fragment', async () => {
      const { buildXoStoreFragment, parseXoStoreFragment } = await import('./xoStoreImport');
      const result = parseXoStoreFragment(buildXoStoreFragment(VALID));
      expect(result).toEqual({
        status: 'ok',
        tasting: { acidity: 3, sweetness: 4, body: 3, overall: 5, brewMethod: 'v60', note: 'Ягоды и карамель', id: 'oi-42' },
      });
    });

    it('ignores fragments that are not an XO Store handoff', async () => {
      const { parseXoStoreFragment } = await import('./xoStoreImport');
      expect(parseXoStoreFragment('')).toEqual({ status: 'none' });
      expect(parseXoStoreFragment('#section-2')).toEqual({ status: 'none' });
      expect(parseXoStoreFragment('#src=other&v=1&acidity=3')).toEqual({ status: 'none' });
    });

    it('defaults a missing brew method to custom and a missing note to empty', async () => {
      const { buildXoStoreFragment, parseXoStoreFragment } = await import('./xoStoreImport');
      const result = parseXoStoreFragment(buildXoStoreFragment({ acidity: 1, sweetness: 1, body: 1, overall: 1 }));
      expect(result.status === 'ok' && result.tasting).toMatchObject({ brewMethod: 'custom', note: '', id: null });
    });

    it.each([
      ['score 0', { ...VALID, acidity: 0 }],
      ['score 6', { ...VALID, overall: 6 }],
      ['non-integer score', { ...VALID, body: 2.5 }],
      ['unknown brew method', { ...VALID, brew: 'magic' }],
      ['too-long note', { ...VALID, note: 'x'.repeat(501) }],
      ['bad id', { ...VALID, id: 'a b/c' }],
    ])('rejects %s', async (_name, input) => {
      const { buildXoStoreFragment, parseXoStoreFragment } = await import('./xoStoreImport');
      expect(parseXoStoreFragment(buildXoStoreFragment(input)).status).toBe('invalid');
    });

    it('rejects a missing score and an unsupported version', async () => {
      const { parseXoStoreFragment } = await import('./xoStoreImport');
      expect(parseXoStoreFragment('#src=xo-store&v=1&acidity=3&sweetness=3&body=3').status).toBe('invalid');
      expect(parseXoStoreFragment('#src=xo-store&v=2&acidity=3&sweetness=3&body=3&overall=3').status).toBe('invalid');
    });
  });

  describe('import', () => {
    async function setup() {
      const xo = await import('./xoStoreImport');
      const store = await import('./store');
      const parsed = xo.parseXoStoreFragment(xo.buildXoStoreFragment(VALID));
      if (parsed.status !== 'ok') throw new Error('fixture invalid');
      return { xo, store, tasting: parsed.tasting };
    }

    it('saves an ordinary private anonymous tasting for the lot', async () => {
      const { xo, store, tasting } = await setup();
      expect(xo.importXoStoreTasting(LOT, tasting, 'anon-1', store.addTastingRecord)).toBe('imported');
      const records = store.getSnapshot();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        lotId: 'LOT-XO-COL-004',
        userId: 'anon-1',
        rating: 5,
        brewingMethod: 'v60',
        note: 'Ягоды и карамель',
        isPublic: false,
        guestFlavorProfile: { acidity: 3, sweetness: 4, body: 3, bitterness: 0 },
      });
      await flush();
    });

    it('is idempotent: opening the same link again creates no second tasting', async () => {
      const { xo, store, tasting } = await setup();
      expect(xo.importXoStoreTasting(LOT, tasting, 'anon-1', store.addTastingRecord)).toBe('imported');
      expect(xo.importXoStoreTasting(LOT, tasting, 'anon-1', store.addTastingRecord)).toBe('duplicate');
      // even after sign-in on the same device
      expect(xo.importXoStoreTasting(LOT, tasting, 'user-1', store.addTastingRecord)).toBe('duplicate');
      expect(store.getSnapshot()).toHaveLength(1);
      await flush();
    });

    it('derives a stable key from the payload when Store sends no id', async () => {
      const { xo, store } = await setup();
      const parsed = xo.parseXoStoreFragment(xo.buildXoStoreFragment({ ...VALID, id: undefined }));
      if (parsed.status !== 'ok') throw new Error('fixture invalid');
      expect(xo.importXoStoreTasting(LOT, parsed.tasting, 'anon-1', store.addTastingRecord)).toBe('imported');
      expect(xo.importXoStoreTasting(LOT, parsed.tasting, 'anon-1', store.addTastingRecord)).toBe('duplicate');
      // a genuinely different rating is a different tasting
      const other = { ...parsed.tasting, overall: 2 };
      expect(xo.importXoStoreTasting(LOT, other, 'anon-1', store.addTastingRecord)).toBe('imported');
      expect(store.getSnapshot()).toHaveLength(2);
      await flush();
    });

    it('guest to sign-up: the existing claim carries the imported tasting into the account, once', async () => {
      const { xo, store, tasting } = await setup();
      xo.importXoStoreTasting(LOT, tasting, 'anon-1', store.addTastingRecord);
      await flush();
      await store.claimAnonymousTastings('anon-1', 'user-1');
      await store.claimAnonymousTastings('anon-1', 'user-1');
      const records = store.getSnapshot();
      expect(records).toHaveLength(1);
      expect(records[0].userId).toBe('user-1');
      expect(records[0].lotId).toBe('LOT-XO-COL-004');
    });

    it('signed-in user: saved straight to the account and written through to checkins', async () => {
      const { xo, store, tasting } = await setup();
      xo.importXoStoreTasting(LOT, tasting, 'user-1', store.addTastingRecord);
      await flush();
      expect(store.getSnapshot()[0].userId).toBe('user-1');
      const rows = insertedRows.filter((r) => r.table === 'checkins');
      expect(rows).toHaveLength(1);
      expect(rows[0].row).toMatchObject({ lot_id: 'LOT-XO-COL-004', owner_user_id: 'user-1' });
    });

    it('a different lot with the same rating is a separate tasting (no cross-lot variants)', async () => {
      const { xo, store, tasting } = await setup();
      xo.importXoStoreTasting(LOT, tasting, 'anon-1', store.addTastingRecord);
      xo.importXoStoreTasting({ ...LOT, id: 'LOT-XO-ETH-001' }, tasting, 'anon-1', store.addTastingRecord);
      expect(store.getSnapshot().map((r) => r.lotId).sort()).toEqual(['LOT-XO-COL-004', 'LOT-XO-ETH-001']);
      await flush();
    });
  });
});
