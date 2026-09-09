import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TastingRecord } from '@/lib/types/coffee';

// TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md — covers the write-path
// scenarios from TASTE_INTENT_HISTORICAL_LINK_AUDIT.md's Step 4 (A, B, C, D,
// E, F). Scenario G (Community anonymity) has no TS code path to exercise —
// it's a property of checkins_community_view's own column list (verified by
// reading the migration, see the implementation report) — so it isn't
// re-asserted here.
//
// No jsdom is installed in this project; lib/journey/store.ts only ever
// calls window.localStorage.getItem/setItem, so a minimal in-memory stand-in
// is enough — installing a full DOM environment for this would be scope the
// task doesn't need.
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

type InsertedRow = { table: string; row: unknown };

const insertedRows: InsertedRow[] = [];

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

// lot public_id -> canonical Lot row, and canonical lots.id -> whichever
// reference_taste_profiles row is `active` right now — both mutable per
// test so a test can simulate activateTasteProfile() changing what's active
// mid-scenario (see the C/D test below).
const canonicalLots: Record<string, { id: string }> = {};
const activeProfiles: Record<
  string,
  { id: string; acidity: number; sweetness: number; body: number; bitterness: number } | null
> = {};

vi.mock('@/lib/data/canonicalLotStore', () => ({
  findCanonicalLotByPublicId: vi.fn(async (publicId: string) => canonicalLots[publicId] ?? null),
  getActiveReferenceTasteProfile: vi.fn(async (lotUuid: string) => activeProfiles[lotUuid] ?? null),
}));

function baseInput(): Omit<TastingRecord, 'id' | 'userId' | 'createdAt'> {
  return {
    lotId: 'LOT-PUBLIC-1',
    roasterId: 'roaster-1',
    coffeeShopId: 'shop-1',
    brewingMethod: 'v60' as TastingRecord['brewingMethod'],
    rating: 4,
    sensoryTags: [],
    subDescriptors: {},
    bodyTexture: null,
    defects: [],
    liked: '',
    disliked: '',
    note: '',
    baristaId: '',
    baristaRating: 0,
    baristaNote: '',
    guestFlavorProfile: { acidity: 3, sweetness: 3, body: 3, bitterness: 3 },
    drinkCategory: '',
    drinkType: '',
    customDrinkName: '',
    milkBaseType: null,
    cowMilkType: null,
    isLactoseFree: false,
    fatContentPercent: null,
    plantMilkType: null,
    milkBalance: null,
    coffeeReadability: null,
    creaminess: null,
    aftertaste: null,
    isPublic: false,
  };
}

// addTastingRecord's reference-resolution + insert chain is a fire-and-forget
// `void promise.then(...)` — a couple of real timer turns reliably drains
// the whole microtask chain (two mocked awaits, then the insert) regardless
// of exactly how many hops deep it is, since a real timer callback only runs
// after Node's microtask queue is fully empty.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(
    () => new Promise((resolve) => setTimeout(resolve, 0))
  );
}

describe('lib/journey/store — Taste Intent historical link', () => {
  beforeEach(() => {
    vi.resetModules();
    insertedRows.length = 0;
    for (const key of Object.keys(canonicalLots)) delete canonicalLots[key];
    for (const key of Object.keys(activeProfiles)) delete activeProfiles[key];
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('recordToRow maps referenceTasteProfileId onto reference_taste_profile_ref, defaulting to null', async () => {
    const { recordToRow } = await import('./store');
    const record: TastingRecord = { ...baseInput(), id: 't1', userId: 'u1', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(recordToRow(record).reference_taste_profile_ref).toBeNull();
    expect(recordToRow({ ...record, referenceTasteProfileId: 'profile-v1' }).reference_taste_profile_ref).toBe(
      'profile-v1'
    );
  });

  it('A: a new tasting resolves and stamps the currently active Taste Intent version', async () => {
    canonicalLots['LOT-PUBLIC-1'] = { id: 'canonical-uuid-1' };
    activeProfiles['canonical-uuid-1'] = { id: 'taste-v1', acidity: 3, sweetness: 3, body: 3, bitterness: 3 };
    const { addTastingRecord } = await import('./store');

    addTastingRecord(baseInput(), 'user-1');
    await flush();

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0].row as { reference_taste_profile_ref: string | null };
    expect(row.reference_taste_profile_ref).toBe('taste-v1');
  });

  it('B/C/D: an old tasting keeps the version active when IT was recorded; a tasting recorded after the change gets the new version', async () => {
    canonicalLots['LOT-PUBLIC-1'] = { id: 'canonical-uuid-1' };
    activeProfiles['canonical-uuid-1'] = { id: 'taste-v1', acidity: 3, sweetness: 3, body: 3, bitterness: 3 };
    const { addTastingRecord } = await import('./store');

    const oldTasting = addTastingRecord(baseInput(), 'user-1');
    await flush();

    // B: the roaster activates a new Taste Intent version — v1 superseded,
    // v2 active. Nothing in this test touches the old tasting again.
    activeProfiles['canonical-uuid-1'] = { id: 'taste-v2', acidity: 4, sweetness: 4, body: 4, bitterness: 4 };

    const newTasting = addTastingRecord(baseInput(), 'user-1');
    await flush();

    expect(insertedRows).toHaveLength(2);
    const [first, second] = insertedRows.map((r) => r.row) as {
      id: string;
      reference_taste_profile_ref: string | null;
    }[];

    // C
    expect(first.id).toBe(oldTasting.id);
    expect(first.reference_taste_profile_ref).toBe('taste-v1');
    // D
    expect(second.id).toBe(newTasting.id);
    expect(second.reference_taste_profile_ref).toBe('taste-v2');
  });

  it('F: a Lot with no canonical row yet (or no active profile) leaves the reference null, matching pre-existing checkins', async () => {
    // canonicalLots deliberately left empty.
    const { addTastingRecord } = await import('./store');

    addTastingRecord(baseInput(), 'user-1');
    await flush();

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0].row as { reference_taste_profile_ref: string | null };
    expect(row.reference_taste_profile_ref).toBeNull();
  });

  it('E: claimAnonymousTastings re-owns userId without recomputing the already-captured reference', async () => {
    canonicalLots['LOT-PUBLIC-1'] = { id: 'canonical-uuid-1' };
    activeProfiles['canonical-uuid-1'] = { id: 'taste-v1', acidity: 3, sweetness: 3, body: 3, bitterness: 3 };
    const { addTastingRecord, claimAnonymousTastings } = await import('./store');

    addTastingRecord(baseInput(), 'anon-device-1');
    await flush();

    // Taste Intent changes AFTER the anonymous tasting was recorded but
    // BEFORE the guest signs up and this gets claimed — the claim must not
    // re-resolve and silently pick up v2.
    activeProfiles['canonical-uuid-1'] = { id: 'taste-v2', acidity: 4, sweetness: 4, body: 4, bitterness: 4 };

    insertedRows.length = 0; // isolate the claim's own insert from the tasting's own insert above
    await claimAnonymousTastings('anon-device-1', 'real-user-1');

    expect(insertedRows).toHaveLength(1);
    const claimedRows = insertedRows[0].row as { reference_taste_profile_ref: string | null; owner_user_id: string }[];
    expect(claimedRows).toHaveLength(1);
    expect(claimedRows[0].owner_user_id).toBe('real-user-1');
    expect(claimedRows[0].reference_taste_profile_ref).toBe('taste-v1');
  });
});
