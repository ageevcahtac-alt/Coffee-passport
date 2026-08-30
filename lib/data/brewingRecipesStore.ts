'use client';

import type { BrewingRecipe } from '@/lib/types/coffee';

// Multi-author brewing recipes (roaster benchmark / coffee shop / enthusiast),
// attached to a Lot. Same no-backend pattern as reviewRepliesStore/lotsStore:
// local persistence now, shaped to drop straight onto a future
// public.brewing_recipes table once this flow is wired to real auth.

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

export function addBrewingRecipe(input: Omit<BrewingRecipe, 'id' | 'createdAt'>): BrewingRecipe {
  const recipe: BrewingRecipe = {
    ...input,
    id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  write([recipe, ...read()]);
  return recipe;
}
