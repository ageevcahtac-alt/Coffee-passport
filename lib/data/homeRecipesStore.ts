'use client';

import type { HomeRecipe } from '@/lib/types/coffee';
import { generateId } from '@/lib/utils/id';

// "My Taste" — the enthusiast's fully standalone home-brewing recipe log
// (see app/(site)/my-taste). No backend table yet, same localStorage-only
// idiom as lib/data/cuppingsStore.ts. Unlike lib/data/brewingRecipesStore.ts
// (which requires a real Lot and syncs to Supabase), a HomeRecipe never
// references a Lot/coffee-shop/venue at all — that's the point: a home
// experiment logged here doesn't need a check-in to exist.

const STORAGE_KEY = 'coffee-passport:home-recipes';

const EMPTY_RECIPES: HomeRecipe[] = [];

let cache: HomeRecipe[] | null = null;
const listeners = new Set<() => void>();

function read(): HomeRecipe[] {
  if (typeof window === 'undefined') return EMPTY_RECIPES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as HomeRecipe[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(recipes: HomeRecipe[]) {
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

export function getSnapshot(): HomeRecipe[] {
  return read();
}

export function getServerSnapshot(): HomeRecipe[] {
  return EMPTY_RECIPES;
}

export function addHomeRecipe(
  input: Omit<HomeRecipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  userId: string
): HomeRecipe {
  const now = new Date().toISOString();
  const recipe: HomeRecipe = { ...input, id: generateId(), userId, createdAt: now, updatedAt: now };
  write([recipe, ...read()]);
  return recipe;
}

// Full edit — every field is patchable, including isPublic/isTop, so the
// "Поделиться с сообществом" / "Мой Топ" card actions can reuse this same
// function instead of dedicated setters.
export function updateHomeRecipe(
  id: string,
  patch: Partial<Omit<HomeRecipe, 'id' | 'userId' | 'createdAt'>>
): void {
  const existing = read();
  const index = existing.findIndex((recipe) => recipe.id === id);
  if (index === -1) return;
  const next = [...existing];
  next[index] = { ...next[index], ...patch, updatedAt: new Date().toISOString() };
  write(next);
}

export function deleteHomeRecipe(id: string): void {
  write(read().filter((recipe) => recipe.id !== id));
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — same purge-on-switch guard as every other
// personal store, so a second account signed in on the same browser can't
// see the outgoing account's home recipes.
export function purgeHomeRecipesForUser(userId: string): void {
  write(read().filter((recipe) => recipe.userId !== userId));
}
