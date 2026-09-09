'use client';

import type { CustomCoffeeCupping } from '@/lib/types/kitchen';
import { generateId } from '@/lib/utils/id';

// Cupping evaluations attached to a UserCustomCoffee (see
// lib/data/customCoffeeStore.ts) — one bag can be cupped more than once as
// it rests, so this is its own store keyed by customCoffeeId rather than
// fields bolted onto the coffee itself. localStorage-only, same idiom as
// the rest of Coffee Kitchen's stores.

const STORAGE_KEY = 'coffee-passport:custom-coffee-cuppings';

const EMPTY: CustomCoffeeCupping[] = [];

let cache: CustomCoffeeCupping[] | null = null;
const listeners = new Set<() => void>();

function read(): CustomCoffeeCupping[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CustomCoffeeCupping[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(cuppings: CustomCoffeeCupping[]) {
  cache = cuppings;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cuppings));
  } catch {
    // Storage unavailable — in-memory cache still reflects the change for
    // the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): CustomCoffeeCupping[] {
  return read();
}

export function getServerSnapshot(): CustomCoffeeCupping[] {
  return EMPTY;
}

export function addCustomCoffeeCupping(
  input: Omit<CustomCoffeeCupping, 'id' | 'userId' | 'createdAt'>,
  userId: string
): CustomCoffeeCupping {
  const cupping: CustomCoffeeCupping = { ...input, id: generateId(), userId, createdAt: new Date().toISOString() };
  write([cupping, ...read()]);
  return cupping;
}

export function deleteCustomCoffeeCupping(id: string): void {
  write(read().filter((cupping) => cupping.id !== id));
}

// Cascades when the parent coffee itself is deleted from the shelf — an
// evaluation with no coffee to belong to would just be dead weight.
export function deleteCuppingsForCoffee(customCoffeeId: string): void {
  write(read().filter((cupping) => cupping.customCoffeeId !== customCoffeeId));
}

export function purgeCustomCoffeeCuppingsForUser(userId: string): void {
  write(read().filter((cupping) => cupping.userId !== userId));
}

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — see
// kitchenRecipesStore's claimKitchenRecipesForUser for the general shape.
// A cupping's own userId is independent of its parent UserCustomCoffee's
// userId (no derived/joined field), so it needs this same direct re-tag
// even though the parent coffee is claimed separately by
// customCoffeeStore's claimCustomCoffeeForUser.
export async function claimCustomCoffeeCuppingsForUser(anonUserId: string, realUserId: string): Promise<void> {
  const existing = read();
  if (!existing.some((cupping) => cupping.userId === anonUserId)) return;
  write(existing.map((cupping) => (cupping.userId === anonUserId ? { ...cupping, userId: realUserId } : cupping)));
}
