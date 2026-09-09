import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — covers the
// account-continuity scenarios from that report's own spec: every claimable
// store actually gets claimed, claiming twice never duplicates anything,
// one store's Supabase failure can't block any other store's claim, and an
// already-authenticated account's own data is never silently overwritten
// by an anonymous session's.
//
// Same no-jsdom convention as lib/journey/store.test.ts — a minimal
// in-memory localStorage stand-in, no DOM.
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

type InsertedRow = { table: string; op: 'insert' | 'upsert'; row: unknown };
let insertedRows: InsertedRow[] = [];
let failingTable: string | null = null;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertedRows.push({ table, op: 'insert', row });
        if (table === failingTable) return Promise.resolve({ error: { message: 'simulated failure' }, data: null });
        return Promise.resolve({ error: null, data: null });
      },
      upsert: (row: unknown) => {
        insertedRows.push({ table, op: 'upsert', row });
        if (table === failingTable) return Promise.resolve({ error: { message: 'simulated failure' }, data: null });
        return Promise.resolve({ error: null, data: null });
      },
    }),
  }),
}));

// claimAnonymousTastings (re-exported through the orchestrator) resolves
// canonical Lot / active Taste Intent for context it doesn't actually need
// for a pure re-tag — mocked empty exactly like store.test.ts's own setup,
// so importing lib/journey/store.ts doesn't require a real Supabase schema.
vi.mock('@/lib/data/canonicalLotStore', () => ({
  findCanonicalLotByPublicId: vi.fn(async () => null),
  getActiveReferenceTasteProfile: vi.fn(async () => null),
}));

const ANON = 'anon-device-1';
const REAL = 'real-user-1';
const OTHER_REAL = 'real-user-2';

function setLocal(key: string, value: unknown) {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.setItem(
    key,
    JSON.stringify(value)
  );
}

function getLocal<T>(key: string): T {
  const raw = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : (undefined as unknown as T);
}

beforeEach(() => {
  vi.resetModules();
  insertedRows = [];
  failingTable = null;
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('claimAnonymousUserData — orchestration across every claimable store', () => {
  it('claims tastings, recipes, equipment, kitchen recipes, custom coffee, cuppings, votes, and muted shops in one call', async () => {
    setLocal('coffee-passport:journey', [
      { id: 't1', userId: ANON, lotId: 'LOT-PUBLIC-1', roasterId: 'roaster-1', coffeeShopId: 'shop-1', brewingMethod: 'v60', rating: 4, sensoryTags: [], subDescriptors: {}, bodyTexture: null, defects: [], liked: '', disliked: '', note: '', baristaId: '', baristaRating: 0, baristaNote: '', guestFlavorProfile: { acidity: 3, sweetness: 3, body: 3, bitterness: 3 }, drinkCategory: '', drinkType: '', customDrinkName: '', milkBaseType: null, cowMilkType: null, isLactoseFree: false, fatContentPercent: null, plantMilkType: null, milkBalance: null, coffeeReadability: null, creaminess: null, aftertaste: null, isPublic: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:brewing-recipes', [
      { id: 'r1', lotId: 'L1', brewingMethodId: 'v60', authorType: 'enthusiast', authorId: ANON, authorName: 'Guest', isBenchmark: false, parentRecipeId: null, doseG: 15, yieldG: 250, measuredTdsPercent: null, grinderModel: '', grinderSetting: '', waterTempC: 0, waterBrand: '', waterTds: null, waterCustomMineralization: '', bloomTimeSec: null, preInfusionSec: null, flowRateGPerSec: null, totalTimeSec: 0, equipmentModel: '', pressureBar: null, pressureProfile: '', notes: '', isPublic: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:equipment', [
      { userId: ANON, ownerKind: 'enthusiast', espressoGrinder: '', espressoMachine: '', espressoWater: '', filterGrinder: 'Comandante', filterWater: '', favoriteDeviceIds: [], updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:kitchen-recipes', [
      { id: 'k1', userId: ANON, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:custom-coffees', [
      { id: 'c1', userId: ANON, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:custom-coffee-cuppings', [
      { id: 'cc1', userId: ANON, customCoffeeId: 'c1', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:recipe-votes', [
      { id: 'v1', recipeId: 'community-recipe-1', userId: ANON, value: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:muted-shops', [{ userId: ANON, shopId: 'shop-1', createdAt: '2026-01-01T00:00:00.000Z' }]);

    const { claimAnonymousUserData } = await import('./claimAnonymousData');
    await claimAnonymousUserData(ANON, REAL);

    expect(getLocal<{ userId: string }[]>('coffee-passport:journey')[0].userId).toBe(REAL);
    expect(getLocal<{ authorId: string }[]>('coffee-passport:brewing-recipes')[0].authorId).toBe(REAL);
    expect(getLocal<{ userId: string }[]>('coffee-passport:equipment')[0].userId).toBe(REAL);
    expect(getLocal<{ userId: string }[]>('coffee-passport:kitchen-recipes')[0].userId).toBe(REAL);
    expect(getLocal<{ userId: string }[]>('coffee-passport:custom-coffees')[0].userId).toBe(REAL);
    expect(getLocal<{ userId: string }[]>('coffee-passport:custom-coffee-cuppings')[0].userId).toBe(REAL);
    expect(getLocal<{ userId: string }[]>('coffee-passport:recipe-votes')[0].userId).toBe(REAL);
    expect(getLocal<{ userId: string }[]>('coffee-passport:muted-shops')[0].userId).toBe(REAL);

    // Best-effort Supabase sync attempted for every Supabase-backed store.
    expect(insertedRows.some((r) => r.table === 'checkins')).toBe(true);
    expect(insertedRows.some((r) => r.table === 'recipes')).toBe(true);
    expect(insertedRows.some((r) => r.table === 'equipment_garage')).toBe(true);
    expect(insertedRows.some((r) => r.table === 'shop_mute_preferences')).toBe(true);
    // Nothing is left tagged under the anonymous id anywhere.
    expect(getLocal<{ authorId: string }[]>('coffee-passport:brewing-recipes').some((r) => r.authorId === ANON)).toBe(false);
  });

  it('is idempotent — a second claim on the same anon id is a no-op, never a duplicate', async () => {
    setLocal('coffee-passport:kitchen-recipes', [
      { id: 'k1', userId: ANON, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { claimAnonymousUserData } = await import('./claimAnonymousData');

    await claimAnonymousUserData(ANON, REAL);
    await claimAnonymousUserData(ANON, REAL);

    const recipes = getLocal<{ id: string; userId: string }[]>('coffee-passport:kitchen-recipes');
    expect(recipes).toHaveLength(1);
    expect(recipes[0].userId).toBe(REAL);
  });

  it('one store failing to sync to Supabase never blocks another store\'s claim (partial failure safety)', async () => {
    failingTable = 'recipes';
    setLocal('coffee-passport:brewing-recipes', [
      { id: 'r1', lotId: 'L1', brewingMethodId: 'v60', authorType: 'enthusiast', authorId: ANON, authorName: 'Guest', isBenchmark: false, parentRecipeId: null, doseG: 15, yieldG: 250, measuredTdsPercent: null, grinderModel: '', grinderSetting: '', waterTempC: 0, waterBrand: '', waterTds: null, waterCustomMineralization: '', bloomTimeSec: null, preInfusionSec: null, flowRateGPerSec: null, totalTimeSec: 0, equipmentModel: '', pressureBar: null, pressureProfile: '', notes: '', isPublic: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    setLocal('coffee-passport:kitchen-recipes', [
      { id: 'k1', userId: ANON, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const { claimAnonymousUserData } = await import('./claimAnonymousData');
    await expect(claimAnonymousUserData(ANON, REAL)).resolves.toBeUndefined();

    // recipes' local re-tag still committed even though its Supabase sync
    // was rejected — a failed remote write is never local data loss.
    expect(getLocal<{ authorId: string }[]>('coffee-passport:brewing-recipes')[0].authorId).toBe(REAL);
    // A completely unrelated store's claim is unaffected by recipes' failure.
    expect(getLocal<{ userId: string }[]>('coffee-passport:kitchen-recipes')[0].userId).toBe(REAL);
  });

  it('account isolation: claiming for Account B never touches data already owned by Account A', async () => {
    setLocal('coffee-passport:kitchen-recipes', [
      { id: 'k-a', userId: OTHER_REAL, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'k-anon', userId: ANON, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const { claimAnonymousUserData } = await import('./claimAnonymousData');
    await claimAnonymousUserData(ANON, REAL);

    const recipes = getLocal<{ id: string; userId: string }[]>('coffee-passport:kitchen-recipes');
    expect(recipes.find((r) => r.id === 'k-a')?.userId).toBe(OTHER_REAL);
    expect(recipes.find((r) => r.id === 'k-anon')?.userId).toBe(REAL);
  });
});

describe('claimEquipmentForUser — singleton-per-owner conflict safety', () => {
  it('claims the anonymous Garage when the account has none of its own yet', async () => {
    setLocal('coffee-passport:equipment', [
      { userId: ANON, ownerKind: 'enthusiast', espressoGrinder: '', espressoMachine: '', espressoWater: '', filterGrinder: 'Comandante', filterWater: '', favoriteDeviceIds: [], updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { claimEquipmentForUser } = await import('@/lib/data/equipmentStore');
    await claimEquipmentForUser(ANON, REAL);

    const setups = getLocal<{ userId: string; filterGrinder: string }[]>('coffee-passport:equipment');
    expect(setups).toHaveLength(1);
    expect(setups[0]).toMatchObject({ userId: REAL, filterGrinder: 'Comandante' });
  });

  it('never overwrites an already-owned authenticated Garage with the anonymous one', async () => {
    setLocal('coffee-passport:equipment', [
      { userId: ANON, ownerKind: 'enthusiast', espressoGrinder: '', espressoMachine: '', espressoWater: '', filterGrinder: 'Anonymous Grinder', filterWater: '', favoriteDeviceIds: [], updatedAt: '2026-01-01T00:00:00.000Z' },
      { userId: REAL, ownerKind: 'enthusiast', espressoGrinder: '', espressoMachine: '', espressoWater: '', filterGrinder: 'Already Mine', filterWater: '', favoriteDeviceIds: [], updatedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    const { claimEquipmentForUser } = await import('@/lib/data/equipmentStore');
    await claimEquipmentForUser(ANON, REAL);

    const setups = getLocal<{ userId: string; filterGrinder: string }[]>('coffee-passport:equipment');
    expect(setups.find((s) => s.userId === REAL)?.filterGrinder).toBe('Already Mine');
    // The anonymous entry is left exactly where it was — not deleted, not merged.
    expect(setups.find((s) => s.userId === ANON)?.filterGrinder).toBe('Anonymous Grinder');
  });
});

describe('claimVotesForUser — one vote per (recipe, user), never duplicated', () => {
  it('drops an anonymous vote on a recipe the account already voted on, keeping the authenticated one', async () => {
    setLocal('coffee-passport:recipe-votes', [
      { id: 'v-real', recipeId: 'recipe-1', userId: REAL, value: -1, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'v-anon', recipeId: 'recipe-1', userId: ANON, value: 1, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'v-anon-2', recipeId: 'recipe-2', userId: ANON, value: 1, createdAt: '2026-01-02T00:00:00.000Z' },
    ]);
    const { claimVotesForUser } = await import('@/lib/data/recipeVotesStore');
    await claimVotesForUser(ANON, REAL);

    const votes = getLocal<{ id: string; recipeId: string; userId: string; value: number }[]>('coffee-passport:recipe-votes');
    expect(votes.filter((v) => v.recipeId === 'recipe-1')).toHaveLength(1);
    expect(votes.find((v) => v.recipeId === 'recipe-1')?.value).toBe(-1);
    expect(votes.find((v) => v.recipeId === 'recipe-2')).toMatchObject({ userId: REAL, value: 1 });
  });
});

describe('claimMutedShopsForUser — one mute per (shop, user), never duplicated', () => {
  it('drops an anonymous mute for a shop the account already muted, and only syncs newly-claimed rows', async () => {
    setLocal('coffee-passport:muted-shops', [
      { userId: REAL, shopId: 'shop-already-muted', createdAt: '2026-01-01T00:00:00.000Z' },
      { userId: ANON, shopId: 'shop-already-muted', createdAt: '2026-01-02T00:00:00.000Z' },
      { userId: ANON, shopId: 'shop-new', createdAt: '2026-01-02T00:00:00.000Z' },
    ]);
    const { claimMutedShopsForUser } = await import('@/lib/data/shopMutePreferencesStore');
    await claimMutedShopsForUser(ANON, REAL);

    const records = getLocal<{ userId: string; shopId: string }[]>('coffee-passport:muted-shops');
    expect(records.filter((r) => r.shopId === 'shop-already-muted')).toHaveLength(1);
    expect(records.find((r) => r.shopId === 'shop-new')).toMatchObject({ userId: REAL });
    expect(insertedRows.filter((r) => r.table === 'shop_mute_preferences')).toHaveLength(1);
    expect((insertedRows[0].row as { shop_id: string }[])[0].shop_id).toBe('shop-new');
  });
});
