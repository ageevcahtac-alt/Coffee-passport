'use client';

import type { CuppingRecord } from '@/lib/types/coffee';
import { generateId } from '@/lib/utils/id';

// The enthusiast's personal cupping journal — no backend table yet, so this
// is a plain localStorage array, same no-backend idiom as
// lib/data/customDevicesStore.ts. Records for every user share one storage
// key; callers filter by userId themselves (same convention as
// lib/journey/store.ts / useJourney()).

const STORAGE_KEY = 'coffee-passport:cuppings';

const EMPTY_RECORDS: CuppingRecord[] = [];

let cache: CuppingRecord[] | null = null;
const listeners = new Set<() => void>();

function read(): CuppingRecord[] {
  if (typeof window === 'undefined') return EMPTY_RECORDS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CuppingRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(records: CuppingRecord[]) {
  cache = records;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
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

export function getSnapshot(): CuppingRecord[] {
  return read();
}

export function getServerSnapshot(): CuppingRecord[] {
  return EMPTY_RECORDS;
}

export function addCuppingRecord(
  input: Omit<CuppingRecord, 'id' | 'userId' | 'createdAt'>,
  userId: string
): CuppingRecord {
  const record: CuppingRecord = {
    ...input,
    id: generateId(),
    userId,
    createdAt: new Date().toISOString(),
  };
  write([record, ...read()]);
  return record;
}

export function deleteCuppingRecord(id: string): void {
  write(read().filter((record) => record.id !== id));
}

// Final release audit (COFFEE_PASSPORT_FINAL_RELEASE_AUDIT.md) — this store
// shares one localStorage key across every user on the browser (see the
// header comment above) but was missing from lib/journey/userScope.ts's
// reconcileUserScope purge list, unlike every sibling personal store
// (journey, recipes, equipment, votes, kitchen recipes, custom coffee,
// custom coffee cuppings, muted shops). Not exploitable today — the one
// current reader (app/(site)/journey/cuppings/page.tsx) already filters by
// userId — but it's inconsistent with the pattern and would silently leak
// the moment a future unfiltered consumer is added. Same shape as
// purgeCustomCoffeeCuppingsForUser.
export function purgeCuppingsForUser(userId: string): void {
  write(read().filter((record) => record.userId !== userId));
}
