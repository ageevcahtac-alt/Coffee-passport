'use client';

import type { TastingRecord } from '@/lib/types/coffee';

// Local, no-backend persistence for the first vertical slice. Swap for a
// Supabase-backed store once this flow is wired to real auth — the shape of
// TastingRecord and the read/write API here are written to make that swap a
// drop-in replacement, not a rewrite.

const STORAGE_KEY = 'coffee-passport:journey';
export const DEMO_USER_ID = 'demo-user';

// useSyncExternalStore requires getServerSnapshot to return a referentially
// stable value — a fresh `[]` literal on every call trips React's "should be
// cached to avoid an infinite loop" warning, so both the SSR branch of
// read() and getServerSnapshot() share this one instance.
const EMPTY_RECORDS: TastingRecord[] = [];

let cache: TastingRecord[] | null = null;
const listeners = new Set<() => void>();

// TastingRecord has grown fields since this store's earliest deploys (e.g.
// guestFlavorProfile, added for blind-cupping comparisons) — a browser that
// saved records before that still has old-shaped JSON in localStorage.
// Backfilling missing fields here, once, at the read boundary means every
// consumer (roaster analytics, TasteComparison, etc.) can trust the
// TastingRecord type instead of each one re-guessing a fallback.
function normalizeRecord(record: TastingRecord): TastingRecord {
  return {
    ...record,
    guestFlavorProfile: record.guestFlavorProfile ?? { acidity: 0, sweetness: 0, body: 0, bitterness: 0 },
    subDescriptors: record.subDescriptors ?? {},
    bodyTexture: record.bodyTexture ?? null,
    defects: record.defects ?? [],
  };
}

function read(): TastingRecord[] {
  if (typeof window === 'undefined') return EMPTY_RECORDS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TastingRecord[]) : [];
    cache = parsed.map(normalizeRecord);
  } catch {
    cache = [];
  }
  return cache;
}

function write(records: TastingRecord[]) {
  cache = records;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable (private mode, quota) — keep the in-memory cache
    // so the current session still works, just without persistence.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): TastingRecord[] {
  return read();
}

export function getServerSnapshot(): TastingRecord[] {
  return EMPTY_RECORDS;
}

export function addTastingRecord(
  input: Omit<TastingRecord, 'id' | 'userId' | 'createdAt'>
): TastingRecord {
  const record: TastingRecord = {
    ...input,
    id: `tasting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: DEMO_USER_ID,
    createdAt: new Date().toISOString(),
  };
  write([record, ...read()]);
  return record;
}
