'use client';

import type { KitchenRecipe } from '@/lib/types/kitchen';
import { generateId } from '@/lib/utils/id';

// "Мои рецепты" (Coffee Kitchen, /coffee-kitchen/recipes) — the
// enthusiast's fully standalone home-brewing recipe log, renamed from the
// earlier "My Taste" / HomeRecipe. No backend table yet, same
// localStorage-only idiom as lib/data/cuppingsStore.ts. Unlike
// lib/data/brewingRecipesStore.ts (which requires a real Lot and syncs to
// Supabase), a KitchenRecipe never references a Lot/coffee-shop/venue at
// all — that's the point: a home experiment logged here doesn't need a
// check-in to exist.

const STORAGE_KEY = 'coffee-passport:kitchen-recipes';

const EMPTY_RECIPES: KitchenRecipe[] = [];

let cache: KitchenRecipe[] | null = null;
const listeners = new Set<() => void>();

function read(): KitchenRecipe[] {
  if (typeof window === 'undefined') return EMPTY_RECIPES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as KitchenRecipe[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(recipes: KitchenRecipe[]) {
  cache = recipes;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    // Storage unavailable (private mode, quota) — in-memory cache still
    // reflects the change for the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): KitchenRecipe[] {
  return read();
}

export function getServerSnapshot(): KitchenRecipe[] {
  return EMPTY_RECIPES;
}

export function addKitchenRecipe(
  input: Omit<KitchenRecipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  userId: string
): KitchenRecipe {
  const now = new Date().toISOString();
  const recipe: KitchenRecipe = { ...input, id: generateId(), userId, createdAt: now, updatedAt: now };
  write([recipe, ...read()]);
  return recipe;
}

// Full edit — every field is patchable, including isPublic/isTop, so the
// "Поделиться с сообществом" / "Мой Топ" card actions can reuse this same
// function instead of dedicated setters.
export function updateKitchenRecipe(
  id: string,
  patch: Partial<Omit<KitchenRecipe, 'id' | 'userId' | 'createdAt'>>
): void {
  const existing = read();
  const index = existing.findIndex((recipe) => recipe.id === id);
  if (index === -1) return;
  const next = [...existing];
  next[index] = { ...next[index], ...patch, updatedAt: new Date().toISOString() };
  write(next);
}

export function deleteKitchenRecipe(id: string): void {
  write(read().filter((recipe) => recipe.id !== id));
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — same purge-on-switch guard as every other
// personal store, so a second account signed in on the same browser can't
// see the outgoing account's recipes.
export function purgeKitchenRecipesForUser(userId: string): void {
  write(read().filter((recipe) => recipe.userId !== userId));
}
