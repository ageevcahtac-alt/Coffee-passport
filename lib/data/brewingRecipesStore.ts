'use client';

import type { BrewingRecipe } from '@/lib/types/coffee';
import type { RecipeRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// Multi-author brewing recipes (roaster benchmark / coffee shop / enthusiast),
// attached to a Lot. localStorage is now a read cache, not the source of
// truth: syncRecipesFromSupabase() below pulls public recipes plus (when
// signed in) the current user's own from Supabase's public.recipes table
// (see supabase/migrations/0005_recipes_equipment_checkins.sql), and
// addBrewingRecipe() writes through on every save, best-effort — a failed
// write (offline, or an anonymous enthusiast with no real account) still
// lands locally, it just won't show up on another device until the
// account is signed in and reachable again.

const STORAGE_KEY = 'coffee-passport:brewing-recipes';

let cache: BrewingRecipe[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_RECIPES: BrewingRecipe[] = [];

function read(): BrewingRecipe[] {
  if (typeof window === 'undefined') return EMPTY_RECIPES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as BrewingRecipe[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(recipes: BrewingRecipe[]) {
  cache = recipes;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    // Storage unavailable — in-memory cache still reflects the save for
    // the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): BrewingRecipe[] {
  return read();
}

export function getServerSnapshot(): BrewingRecipe[] {
  return EMPTY_RECIPES;
}

function rowToRecipe(row: RecipeRow): BrewingRecipe {
  return {
    id: row.id,
    lotId: row.lot_id,
    brewingMethodId: row.brewing_method_id as BrewingRecipe['brewingMethodId'],
    authorType: row.author_type,
    authorId: row.author_id,
    authorName: row.author_name,
    isBenchmark: row.is_benchmark,
    parentRecipeId: row.parent_recipe_id,
    doseG: row.dose_g,
    yieldG: row.yield_g,
    measuredTdsPercent: row.measured_tds_percent,
    grinderModel: row.grinder_model,
    grinderSetting: row.grinder_setting,
    waterTempC: row.water_temp_c,
    waterBrand: row.water_brand,
    waterTds: row.water_tds,
    waterCustomMineralization: row.water_custom_mineralization,
    bloomTimeSec: row.bloom_time_sec,
    preInfusionSec: row.pre_infusion_sec,
    flowRateGPerSec: row.flow_rate_g_per_sec,
    totalTimeSec: row.total_time_sec,
    equipmentModel: row.equipment_model,
    pressureBar: row.pressure_bar,
    pressureProfile: row.pressure_profile,
    notes: row.notes,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

function recipeToRow(recipe: BrewingRecipe): RecipeRow {
  return {
    id: recipe.id,
    lot_id: recipe.lotId,
    brewing_method_id: recipe.brewingMethodId,
    author_type: recipe.authorType,
    author_id: recipe.authorId,
    author_name: recipe.authorName,
    is_benchmark: recipe.isBenchmark,
    parent_recipe_id: recipe.parentRecipeId,
    dose_g: recipe.doseG,
    yield_g: recipe.yieldG,
    measured_tds_percent: recipe.measuredTdsPercent,
    grinder_model: recipe.grinderModel,
    grinder_setting: recipe.grinderSetting,
    water_temp_c: recipe.waterTempC,
    water_brand: recipe.waterBrand,
    water_tds: recipe.waterTds,
    water_custom_mineralization: recipe.waterCustomMineralization,
    bloom_time_sec: recipe.bloomTimeSec,
    pre_infusion_sec: recipe.preInfusionSec,
    flow_rate_g_per_sec: recipe.flowRateGPerSec,
    total_time_sec: recipe.totalTimeSec,
    equipment_model: recipe.equipmentModel,
    pressure_bar: recipe.pressureBar,
    pressure_profile: recipe.pressureProfile,
    notes: recipe.notes,
    is_public: recipe.isPublic,
    // Real per-account RLS anchor for enthusiast rows only — roaster/
    // coffee_shop rows always carry owner_user_id = null (open pilot-trust
    // tier, see the migration's header note).
    owner_user_id: recipe.authorType === 'enthusiast' ? recipe.authorId : null,
    created_at: recipe.createdAt,
  };
}

function mergeById(local: BrewingRecipe[], incoming: BrewingRecipe[]): BrewingRecipe[] {
  const map = new Map(local.map((recipe) => [recipe.id, recipe]));
  for (const recipe of incoming) map.set(recipe.id, recipe);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Pulls every public recipe (roaster benchmarks, coffee-shop signatures,
// published community recipes) plus — when signed in — this user's own
// private drafts, and overlays them onto the local cache. `isAuthenticated`
// controls the filter shape rather than just passing userId through: an
// anonymous device id isn't a valid uuid, and combining it into the same
// OR filter as owner_user_id would fail the *entire* query (including the
// public half) rather than just that clause.
export async function syncRecipesFromSupabase(
  userId: string | null,
  isAuthenticated: boolean
): Promise<void> {
  try {
    const supabase = getBrowserSupabaseClient();
    const query = supabase.from('recipes').select('*');
    const { data, error } =
      isAuthenticated && userId
        ? await query.or(`is_public.eq.true,owner_user_id.eq.${userId}`)
        : await query.eq('is_public', true);
    if (error || !data) return;
    write(mergeById(read(), (data as RecipeRow[]).map(rowToRecipe)));
  } catch {
    // Offline / table not migrated yet / RLS reject — local cache stands.
  }
}

export function addBrewingRecipe(input: Omit<BrewingRecipe, 'id' | 'createdAt'>): BrewingRecipe {
  const recipe: BrewingRecipe = {
    ...input,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  write([recipe, ...read()]);

  void getBrowserSupabaseClient()
    .from('recipes')
    .insert(recipeToRow(recipe))
    .then(({ error }) => {
      if (error) {
        console.warn('[recipes] Supabase write failed, kept local-only:', error.message);
      }
    });

  return recipe;
}

// Awaited variant of addBrewingRecipe used specifically for barista/
// enthusiast creation — those two author types are quota-scoped (see
// supabase/migrations/0016_recipe_quota_limits.sql), so unlike
// addBrewingRecipe's fire-and-forget write, a rejection from the DB
// trigger must be surfaced instead of silently keeping a local-only
// phantom draft the server never actually accepted.
export async function addRecipeAsDraft(
  input: Omit<BrewingRecipe, 'id' | 'createdAt' | 'isPublic'>
): Promise<{ recipe: BrewingRecipe | null; error: string | null }> {
  const recipe: BrewingRecipe = {
    ...input,
    isPublic: false,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  const { error } = await getBrowserSupabaseClient().from('recipes').insert(recipeToRow(recipe));
  if (error) return { recipe: null, error: error.message };

  write([recipe, ...read()]);
  return { recipe, error: null };
}

// Flips an existing draft to published — subject to the same 14-day-per-
// method cooldown the trigger enforces; a rejection here means the client-
// side check in lib/utils/recipeLimits.ts was stale (another tab/device
// published in the meantime) rather than never having run at all.
export async function publishRecipe(id: string): Promise<{ error: string | null }> {
  const existing = read().find((recipe) => recipe.id === id);
  if (!existing) return { error: 'Рецепт не найден.' };

  const { error } = await getBrowserSupabaseClient()
    .from('recipes')
    .update({ is_public: true })
    .eq('id', id);
  if (error) return { error: error.message };

  write(read().map((recipe) => (recipe.id === id ? { ...recipe, isPublic: true } : recipe)));
  return { error: null };
}

// Full update, for the "Редактировать" action on an existing (draft or
// already-published) recipe the current user/barista owns — RLS already
// permits this (0005's "owner manages own recipes" and 0007's "staff
// manage own org recipes" are both `for all`), there was just no app-level
// function for it before this task (every recipe write used to be a fresh
// insert — see "Адаптировать под себя", which always creates a new row via
// parentRecipeId rather than editing in place).
export async function updateBrewingRecipe(recipe: BrewingRecipe): Promise<{ error: string | null }> {
  const { error } = await getBrowserSupabaseClient()
    .from('recipes')
    .update(recipeToRow(recipe))
    .eq('id', recipe.id);
  if (error) return { error: error.message };

  write(read().map((existing) => (existing.id === recipe.id ? recipe : existing)));
  return { error: null };
}

export async function deleteBrewingRecipe(id: string): Promise<{ error: string | null }> {
  const { error } = await getBrowserSupabaseClient().from('recipes').delete().eq('id', id);
  if (error) return { error: error.message };

  write(read().filter((recipe) => recipe.id !== id));
  return { error: null };
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops only the outgoing user's own enthusiast
// recipes, never roaster/coffee_shop entries (those are shared catalog
// data, not personal to any one account).
export function purgeEnthusiastRecipesForUser(userId: string): void {
  write(read().filter((recipe) => !(recipe.authorType === 'enthusiast' && recipe.authorId === userId)));
}
