'use client';

import type { TastingRecord } from '@/lib/types/coffee';

// Local, no-backend persistence for the first vertical slice. Swap for a
// Supabase-backed store once this flow is wired to real auth — the shape of
// TastingRecord and the read/write API here are written to make that swap a
// drop-in replacement, not a rewrite.

const STORAGE_KEY = 'coffee-passport:journey';
const DEMO_USER_ID = 'demo-user';

// useSyncExternalStore requires getServerSnapshot to return a referentially
// stable value — a fresh `[]` literal on every call trips React's "should be
// cached to avoid an infinite loop" warning, so both the SSR branch of
// read() and getServerSnapshot() share this one instance.
const EMPTY_RECORDS: TastingRecord[] = [];

let cache: TastingRecord[] | null = null;
const listeners = new Set<() => void>();

function read(): TastingRecord[] {
  if (typeof window === 'undefined') return EMPTY_RECORDS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as TastingRecord[]) : [];
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
