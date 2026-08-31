'use client';

import type { TastingRecord } from '@/lib/types/coffee';
import type { CheckinRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// localStorage is now a read cache, not the source of truth: syncCheckins-
// ForUser() below pulls the signed-in user's own rows from Supabase's
// public.checkins table (see supabase/migrations/0005_recipes_equipment_checkins.sql)
// on login, and addTastingRecord() writes through on every save,
// best-effort — a failed write (offline, or browsing without an account)
// still lands locally so the app keeps working, it just won't show up on
// another device until the account is signed in and reachable again.

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

function rowToRecord(row: CheckinRow): TastingRecord {
  return {
    id: row.id,
    userId: row.owner_user_id,
    lotId: row.lot_id,
    roasterId: row.roaster_id,
    coffeeShopId: row.coffee_shop_id,
    brewingMethod: row.brewing_method as TastingRecord['brewingMethod'],
    rating: row.rating,
    sensoryTags: (row.sensory_tags ?? []) as TastingRecord['sensoryTags'],
    subDescriptors: (row.sub_descriptors ?? {}) as TastingRecord['subDescriptors'],
    bodyTexture: row.body_texture as TastingRecord['bodyTexture'],
    defects: (row.defects ?? []) as TastingRecord['defects'],
    liked: row.liked,
    disliked: row.disliked,
    note: row.note,
    baristaId: row.barista_id,
    baristaRating: row.barista_rating,
    baristaNote: row.barista_note,
    guestFlavorProfile: {
      acidity: row.acidity,
      sweetness: row.sweetness,
      body: row.body,
      bitterness: row.bitterness,
    },
    createdAt: row.created_at,
  };
}

function recordToRow(record: TastingRecord): CheckinRow {
  return {
    id: record.id,
    owner_user_id: record.userId,
    lot_id: record.lotId,
    roaster_id: record.roasterId,
    coffee_shop_id: record.coffeeShopId,
    brewing_method: record.brewingMethod,
    rating: record.rating,
    acidity: record.guestFlavorProfile.acidity,
    sweetness: record.guestFlavorProfile.sweetness,
    body: record.guestFlavorProfile.body,
    bitterness: record.guestFlavorProfile.bitterness,
    body_texture: record.bodyTexture,
    sensory_tags: record.sensoryTags,
    sub_descriptors: record.subDescriptors,
    defects: record.defects,
    liked: record.liked,
    disliked: record.disliked,
    note: record.note,
    barista_id: record.baristaId,
    barista_rating: record.baristaRating,
    barista_note: record.baristaNote,
    created_at: record.createdAt,
  };
}

function mergeById(local: TastingRecord[], incoming: TastingRecord[]): TastingRecord[] {
  const map = new Map(local.map((record) => [record.id, record]));
  for (const record of incoming) map.set(record.id, record);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Pulls this signed-in user's own checkins from Supabase and overlays them
// onto the local cache. Checkins have no public tier (unlike recipes) —
// only ever meaningful for a real account, so this is a no-op for
// anonymous browsing (nothing to pull, and owner_user_id is a uuid column
// an anonymous device id wouldn't cast into anyway).
export async function syncCheckinsForUser(userId: string, isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('checkins').select('*').eq('owner_user_id', userId);
    if (error || !data) return;
    write(mergeById(read(), (data as CheckinRow[]).map(rowToRecord)));
  } catch {
    // Offline / table not migrated yet / RLS reject — local cache stands.
  }
}

export function addTastingRecord(
  input: Omit<TastingRecord, 'id' | 'userId' | 'createdAt'>,
  userId: string
): TastingRecord {
  const record: TastingRecord = {
    ...input,
    id: generateId(),
    userId,
    createdAt: new Date().toISOString(),
  };
  write([record, ...read()]);

  void getBrowserSupabaseClient()
    .from('checkins')
    .insert(recordToRow(record))
    .then(({ error }) => {
      if (error) {
        console.warn('[checkins] Supabase write failed, kept local-only:', error.message);
      }
    });

  return record;
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's own tasting
// history so it can't leak into the next account's view of this shared
// local store. Goes through write() (not a raw localStorage overwrite) so
// this store's own in-memory cache and useSyncExternalStore subscribers
// stay consistent regardless of call order.
export function purgeRecordsForUser(userId: string): void {
  write(read().filter((record) => record.userId !== userId));
}
