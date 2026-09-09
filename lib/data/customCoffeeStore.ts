'use client';

import type { UserCustomCoffee } from '@/lib/types/kitchen';
import { generateId } from '@/lib/utils/id';

// "Мой кофе" shelf (Coffee Kitchen, /coffee-kitchen) — bags/lots the
// enthusiast entered entirely by hand, no catalog lookup. localStorage-only,
// same idiom as lib/data/kitchenRecipesStore.ts — see lib/types/kitchen.ts
// for why this store deliberately never references the Lot/Roaster/
// CoffeeShop catalog.

const STORAGE_KEY = 'coffee-passport:custom-coffees';

const EMPTY: UserCustomCoffee[] = [];

let cache: UserCustomCoffee[] | null = null;
const listeners = new Set<() => void>();

function read(): UserCustomCoffee[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as UserCustomCoffee[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(coffees: UserCustomCoffee[]) {
  cache = coffees;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(coffees));
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

export function getSnapshot(): UserCustomCoffee[] {
  return read();
}

export function getServerSnapshot(): UserCustomCoffee[] {
  return EMPTY;
}

export function getCustomCoffeeById(id: string): UserCustomCoffee | undefined {
  return read().find((coffee) => coffee.id === id);
}

export function addCustomCoffee(
  input: Omit<UserCustomCoffee, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  userId: string
): UserCustomCoffee {
  const now = new Date().toISOString();
  const coffee: UserCustomCoffee = { ...input, id: generateId(), userId, createdAt: now, updatedAt: now };
  write([coffee, ...read()]);
  return coffee;
}

export function updateCustomCoffee(
  id: string,
  patch: Partial<Omit<UserCustomCoffee, 'id' | 'userId' | 'createdAt'>>
): void {
  const existing = read();
  const index = existing.findIndex((coffee) => coffee.id === id);
  if (index === -1) return;
  const next = [...existing];
  next[index] = { ...next[index], ...patch, updatedAt: new Date().toISOString() };
  write(next);
}

export function deleteCustomCoffee(id: string): void {
  write(read().filter((coffee) => coffee.id !== id));
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts).
export function purgeCustomCoffeeForUser(userId: string): void {
  write(read().filter((coffee) => coffee.userId !== userId));
}

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — see
// kitchenRecipesStore's claimKitchenRecipesForUser for the general shape:
// no backend table, pure local re-tag, each entry's own generated id
// prevents any collision, idempotent by construction.
export async function claimCustomCoffeeForUser(anonUserId: string, realUserId: string): Promise<void> {
  const existing = read();
  if (!existing.some((coffee) => coffee.userId === anonUserId)) return;
  write(existing.map((coffee) => (coffee.userId === anonUserId ? { ...coffee, userId: realUserId } : coffee)));
}
