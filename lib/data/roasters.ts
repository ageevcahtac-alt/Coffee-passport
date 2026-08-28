'use client';

import type { Roaster } from '@/lib/types/coffee';

export const SEED_ROASTERS: Roaster[] = [
  {
    id: 'roaster-xo',
    name: 'XO COFFEE Roasting',
    slug: 'xo-coffee',
    color: '#D4AF37',
    philosophy: 'Прозрачная цепочка от фермера до чашки — у каждого лота есть имя и история.',
    city: 'Всеволожск',
    country: 'Россия',
  },
  {
    id: 'roaster-north',
    name: 'North Star Roasters',
    slug: 'north-star',
    color: '#5C6B4F',
    philosophy: 'Светлая обжарка, которая раскрывает терруар лота, а не прячет его под жаром.',
    city: 'Санкт-Петербург',
    country: 'Россия',
  },
];

// Seed roasters merged with anything the admin panel (Реестр партнёров /
// Активировать партнёра) saved to localStorage — same override-on-seed
// idiom as lib/data/lotsStore.ts, chosen so every one of the ~15 existing
// getRoasterById() call sites across the app picks up admin edits for
// free, with no import-path changes anywhere else.
const STORAGE_KEY = 'coffee-passport:roasters';

let cache: Roaster[] | null = null;
const listeners = new Set<() => void>();

function readOverrides(): Roaster[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Roaster[]) : [];
  } catch {
    return [];
  }
}

function computeAll(): Roaster[] {
  const merged = new Map<string, Roaster>();
  for (const roaster of SEED_ROASTERS) merged.set(roaster.id, roaster);
  for (const roaster of readOverrides()) merged.set(roaster.id, roaster);
  return Array.from(merged.values());
}

function read(): Roaster[] {
  if (typeof window === 'undefined') return SEED_ROASTERS;
  if (!cache) cache = computeAll();
  return cache;
}

export function subscribeRoasters(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRoastersSnapshot(): Roaster[] {
  return read();
}

export function getRoastersServerSnapshot(): Roaster[] {
  return SEED_ROASTERS;
}

export function getRoasterById(id: string): Roaster | undefined {
  return read().find((roaster) => roaster.id === id);
}

export function saveRoaster(roaster: Roaster): void {
  const overrides = readOverrides();
  const index = overrides.findIndex((existing) => existing.id === roaster.id);
  if (index >= 0) overrides[index] = roaster;
  else overrides.push(roaster);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — the in-memory cache below still reflects the
    // save for the rest of this session.
  }
  cache = computeAll();
  listeners.forEach((listener) => listener());
}

export function generateRoasterId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  const existingIds = new Set(read().map((roaster) => roaster.id));
  let id = `roaster-${slug || 'partner'}`;
  let sequence = 2;
  while (existingIds.has(id)) {
    id = `roaster-${slug || 'partner'}-${sequence}`;
    sequence += 1;
  }
  return id;
}

// Backward-compatible alias — most of the app still imports ROASTERS
// expecting the static seed list for demo/menu-picker purposes. Anything
// that needs live admin edits should use getRoasterById/getRoastersSnapshot
// instead.
export const ROASTERS = SEED_ROASTERS;
