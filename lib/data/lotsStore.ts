'use client';

import type { Lot, Roaster } from '@/lib/types/coffee';
import { LOTS as SEED_LOTS } from './lots';

// Roaster-created/edited lots layer on top of the static seed data, the same
// way TastingRecord does for journey entries (see lib/journey/store.ts): no
// backend yet, so the roaster's own edits live in localStorage and are
// merged with the seed lots at read time. Overrides win on id collision,
// which is also how editing an existing (seed) lot works.

const STORAGE_KEY = 'coffee-passport:lots';

let cache: Lot[] | null = null;
const listeners = new Set<() => void>();

// Lot has grown fields since this store's earliest deploys (e.g. variety,
// added after some roaster edits were already saved) — a browser with an
// old-shaped override in localStorage would otherwise hand out a lot
// missing that field. Backfilling here, once, means every consumer trusts
// the Lot type instead of re-guessing a fallback (see the same idiom in
// lib/journey/store.ts for TastingRecord).
function normalizeLot(lot: Lot): Lot {
  return {
    ...lot,
    variety: lot.variety ?? '',
    inRoasterCatalog: lot.inRoasterCatalog ?? true,
  };
}

function readOverrides(): Lot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Lot[]) : [];
    return parsed.map(normalizeLot);
  } catch {
    return [];
  }
}

function computeAll(): Lot[] {
  const merged = new Map<string, Lot>();
  for (const lot of SEED_LOTS) merged.set(lot.id, lot);
  for (const lot of readOverrides()) merged.set(lot.id, lot);
  return Array.from(merged.values());
}

function read(): Lot[] {
  if (typeof window === 'undefined') return SEED_LOTS;
  if (!cache) cache = computeAll();
  return cache;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Lot[] {
  return read();
}

export function getServerSnapshot(): Lot[] {
  return SEED_LOTS;
}

export function getMergedLotById(id: string): Lot | undefined {
  return read().find((lot) => lot.id === id);
}

export function saveLot(lot: Lot): void {
  const overrides = readOverrides();
  const index = overrides.findIndex((existing) => existing.id === lot.id);
  if (index >= 0) overrides[index] = lot;
  else overrides.push(lot);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — the in-memory cache below still reflects the
    // save for the rest of this session.
  }
  cache = computeAll();
  listeners.forEach((listener) => listener());
}

export function generateLotId(roaster: Roaster, country: string): string {
  const roasterCode = (roaster.slug.split('-')[0] || roaster.slug).slice(0, 3).toUpperCase();
  const countryCode = (country.trim() || 'XXX').slice(0, 3).toUpperCase();
  const existingIds = new Set(read().map((lot) => lot.id));

  let sequence = 1;
  let id = '';
  do {
    id = `LOT-${roasterCode}-${countryCode}-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (existingIds.has(id));

  return id;
}
