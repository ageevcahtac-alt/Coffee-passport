import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrewingRecipe } from '@/lib/types/coffee';

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — covers the
// create/update/delete/ownership scenarios from that report's Café
// Signature Recipe CRUD section, plus claimEnthusiastRecipesForUser's own
// "never claim a non-enthusiast row" guard. Same no-jsdom, minimal
// in-memory localStorage convention as lib/journey/store.test.ts.
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

type Call = { method: 'insert' | 'update' | 'delete'; payload?: unknown; eqId?: string };
let calls: Call[] = [];
let nextError: string | null = null;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        calls.push({ method: 'insert', payload: row });
        return Promise.resolve({ error: nextError ? { message: nextError } : null, data: null });
      },
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => {
          calls.push({ method: 'update', payload: patch, eqId: id });
          return Promise.resolve({ error: nextError ? { message: nextError } : null, data: null });
        },
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          calls.push({ method: 'delete', eqId: id });
          return Promise.resolve({ error: nextError ? { message: nextError } : null, data: null });
        },
      }),
    }),
  }),
}));

function baseRecipe(overrides: Partial<BrewingRecipe> = {}): Omit<BrewingRecipe, 'id' | 'createdAt'> {
  return {
    lotId: 'lot-1',
    brewingMethodId: 'v60',
    authorType: 'coffee_shop',
    authorId: 'shop-1',
    authorName: 'Shop One',
    isBenchmark: false,
    parentRecipeId: null,
    doseG: 15,
    yieldG: 250,
    measuredTdsPercent: null,
    grinderModel: '',
    grinderSetting: '',
    waterTempC: 0,
    waterBrand: '',
    waterTds: null,
    waterCustomMineralization: '',
    bloomTimeSec: null,
    preInfusionSec: null,
    flowRateGPerSec: null,
    totalTimeSec: 0,
    equipmentModel: '',
    pressureBar: null,
    pressureProfile: '',
    notes: '',
    isPublic: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  calls = [];
  nextError = null;
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('lib/data/brewingRecipesStore — café Signature Recipe CRUD', () => {
  it('addBrewingRecipe creates locally and write-throughs to Supabase', async () => {
    const { addBrewingRecipe, getSnapshot } = await import('./brewingRecipesStore');
    const recipe = addBrewingRecipe(baseRecipe());
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0].id).toBe(recipe.id);
  });

  it('updateBrewingRecipe edits the existing row in place, not a new one', async () => {
    const { addBrewingRecipe, updateBrewingRecipe, getSnapshot } = await import('./brewingRecipesStore');
    const recipe = addBrewingRecipe(baseRecipe({ doseG: 15, yieldG: 250 }));

    const { error } = await updateBrewingRecipe({ ...recipe, doseG: 18, yieldG: 300 });

    expect(error).toBeNull();
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({ id: recipe.id, doseG: 18, yieldG: 300 });
  });

  it('updateBrewingRecipe leaves local state untouched when RLS rejects the write (wrong café blocked)', async () => {
    const { addBrewingRecipe, updateBrewingRecipe, getSnapshot } = await import('./brewingRecipesStore');
    const recipe = addBrewingRecipe(baseRecipe({ doseG: 15 }));

    nextError = 'new row violates row-level security policy';
    const { error } = await updateBrewingRecipe({ ...recipe, doseG: 99 });

    expect(error).toBe(nextError);
    // Local cache still shows the original value — a rejected write is
    // never silently applied client-side.
    expect(getSnapshot()[0].doseG).toBe(15);
  });

  it('deleteBrewingRecipe removes the row locally once Supabase confirms the delete', async () => {
    const { addBrewingRecipe, deleteBrewingRecipe, getSnapshot } = await import('./brewingRecipesStore');
    const recipe = addBrewingRecipe(baseRecipe());

    const { error } = await deleteBrewingRecipe(recipe.id);

    expect(error).toBeNull();
    expect(getSnapshot()).toHaveLength(0);
  });

  it('deleteBrewingRecipe keeps the row locally when RLS rejects the delete (wrong café blocked)', async () => {
    const { addBrewingRecipe, deleteBrewingRecipe, getSnapshot } = await import('./brewingRecipesStore');
    const recipe = addBrewingRecipe(baseRecipe());

    nextError = 'new row violates row-level security policy';
    const { error } = await deleteBrewingRecipe(recipe.id);

    expect(error).toBe(nextError);
    expect(getSnapshot()).toHaveLength(1);
  });
});

describe('lib/data/brewingRecipesStore — claimEnthusiastRecipesForUser', () => {
  it('re-tags an anonymous enthusiast recipe to the newly authenticated account and syncs it to Supabase', async () => {
    const { addBrewingRecipe, claimEnthusiastRecipesForUser, getSnapshot } = await import('./brewingRecipesStore');
    addBrewingRecipe(baseRecipe({ authorType: 'enthusiast', authorId: 'anon-1' }));

    await claimEnthusiastRecipesForUser('anon-1', 'real-1');

    expect(getSnapshot()[0].authorId).toBe('real-1');
    expect(calls.some((c) => c.method === 'insert')).toBe(true);
  });

  it('never claims a roaster/coffee_shop-authored recipe, even if its authorId happened to match the anon id', async () => {
    const { addBrewingRecipe, claimEnthusiastRecipesForUser, getSnapshot } = await import('./brewingRecipesStore');
    addBrewingRecipe(baseRecipe({ authorType: 'coffee_shop', authorId: 'anon-1' }));

    await claimEnthusiastRecipesForUser('anon-1', 'real-1');

    // Ownership check, not a blind string match — café/roaster catalog
    // content is never personal to whichever anonymous device id happens
    // to equal its authorId.
    expect(getSnapshot()[0].authorId).toBe('anon-1');
    expect(getSnapshot()[0].authorType).toBe('coffee_shop');
  });

  it('is a no-op (never calls Supabase) when there is nothing to claim', async () => {
    const { claimEnthusiastRecipesForUser } = await import('./brewingRecipesStore');
    await claimEnthusiastRecipesForUser('anon-1', 'real-1');
    expect(calls).toHaveLength(0);
  });
});
