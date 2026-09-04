'use client';

import type { CustomBrewMethod } from '@/lib/types/coffee';
import type { CustomBrewMethodRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { RECIPE_LIMITS } from '@/lib/types/coffee';
import { generateId } from '@/lib/utils/id';

// A barista's/enthusiast's own named brewing methods (see
// components/coffee/RecipeBrewMethodSelector.tsx), capped at
// RECIPE_LIMITS.maxCustomMethods per owner. Owner-scoped, not globally
// synced at app bootstrap the way recipes/checkins are — fetched on demand
// by whichever form is currently authoring a recipe, same
// "syncEquipmentFromSupabase(garageOwnerId)"-from-the-consuming-form idiom
// ProRecipeForm/EnthusiastRecipeForm already use for Equipment Garage.

const STORAGE_KEY = 'coffee-passport:custom-brew-methods';

let cache: CustomBrewMethod[] | null = null;
const listeners = new Set<() => void>();

const EMPTY: CustomBrewMethod[] = [];

function read(): CustomBrewMethod[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CustomBrewMethod[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(methods: CustomBrewMethod[]) {
  cache = methods;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(methods));
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

export function getSnapshot(): CustomBrewMethod[] {
  return read();
}

export function getServerSnapshot(): CustomBrewMethod[] {
  return EMPTY;
}

function rowToMethod(row: CustomBrewMethodRow): CustomBrewMethod {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    label: row.label,
    createdAt: row.created_at,
  };
}

function mergeById(local: CustomBrewMethod[], incoming: CustomBrewMethod[]): CustomBrewMethod[] {
  const map = new Map(local.map((method) => [method.id, method]));
  for (const method of incoming) map.set(method.id, method);
  return Array.from(map.values());
}

export async function syncCustomBrewMethodsFromSupabase(
  ownerType: CustomBrewMethod['ownerType'],
  ownerId: string
): Promise<void> {
  if (!ownerId) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('custom_brew_methods')
      .select('*')
      .eq('owner_type', ownerType)
      .eq('owner_id', ownerId);
    if (error || !data) return;
    write(mergeById(read(), (data as CustomBrewMethodRow[]).map(rowToMethod)));
  } catch {
    // Offline / table not migrated yet — local cache stands.
  }
}

export function getCustomBrewMethodsForOwner(
  ownerType: CustomBrewMethod['ownerType'],
  ownerId: string
): CustomBrewMethod[] {
  return read().filter((method) => method.ownerType === ownerType && method.ownerId === ownerId);
}

// Unlike addBrewingRecipe's fire-and-forget local-first write, this awaits
// the Supabase insert before touching the local cache: a client-side cap
// check happens first for fast UX, but the trigger
// (trg_enforce_custom_method_limit) is the real gate, and a rejection must
// not leave a phantom "6th method" sitting in local storage.
export async function addCustomBrewMethod(input: {
  ownerType: CustomBrewMethod['ownerType'];
  ownerId: string;
  label: string;
}): Promise<{ method: CustomBrewMethod | null; error: string | null }> {
  const existingCount = getCustomBrewMethodsForOwner(input.ownerType, input.ownerId).length;
  if (existingCount >= RECIPE_LIMITS.maxCustomMethods) {
    return { method: null, error: `Лимит кастомных способов (${RECIPE_LIMITS.maxCustomMethods}) исчерпан.` };
  }

  const method: CustomBrewMethod = {
    id: `custom-${generateId()}`,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    label: input.label,
    createdAt: new Date().toISOString(),
  };

  const row: CustomBrewMethodRow = {
    id: method.id,
    owner_type: method.ownerType,
    owner_id: method.ownerId,
    label: method.label,
    created_at: method.createdAt,
  };

  const { error } = await getBrowserSupabaseClient().from('custom_brew_methods').insert(row);
  if (error) {
    return { method: null, error: error.message };
  }

  write([...read(), method]);
  return { method, error: null };
}
