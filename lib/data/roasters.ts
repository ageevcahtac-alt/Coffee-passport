'use client';

import type { Roaster } from '@/lib/types/coffee';
import type { RoasterOrgRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

import { ROASTER_COLUMNS, mergePartners, rowToRoaster } from './partnerRows';
import { SEED_ROASTERS } from './roasterSeed';

export { SEED_ROASTERS };

// Built-in roasters merged with public.roasters (0036_partner_directory.sql)
// — same model as coffeeShops.ts: a database row replaces the built-in card
// with the same id (roasters.slug = Roaster.id, e.g. 'roaster-xo'), so every
// one of the getRoasterById() call sites picks up admin edits with no
// import-path changes. Writes go through app/api/admin/partners/**; after
// one, call refreshRoasters(). Old localStorage edits are offered for
// transfer only (getLegacyRoasters).
const STORAGE_KEY = 'coffee-passport:roasters';
const TRANSFERRED_KEY = `${STORAGE_KEY}:transferred`;

let remote: Roaster[] = [];
let cache: Roaster[] | null = null;
let loading: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();

export function refreshRoasters(): Promise<void> {
  loading = (async () => {
    const { data, error } = await getBrowserSupabaseClient().from('roasters').select(ROASTER_COLUMNS);
    loaded = true;
    if (error || !data) {
      console.warn('[roasters] database read failed', error?.message);
      return;
    }
    remote = (data as unknown as RoasterOrgRow[]).map((row) =>
      rowToRoaster(row, SEED_ROASTERS.find((roaster) => roaster.id === row.slug))
    );
    cache = null;
    listeners.forEach((listener) => listener());
  })();
  return loading;
}

function read(): Roaster[] {
  if (typeof window === 'undefined') return SEED_ROASTERS;
  // Lookups without a subscriber (getById on cabinet pages) load the
  // database too; the next render picks the rows up.
  if (!loaded && !loading) void refreshRoasters();
  if (!cache) cache = mergePartners(SEED_ROASTERS, remote);
  return cache;
}

export function subscribeRoasters(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded && !loading && typeof window !== 'undefined') void refreshRoasters();
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

export function isRoasterInDatabase(id: string): boolean {
  return remote.some((roaster) => roaster.id === id);
}

function readJson(key: string): Roaster[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Roaster[]) : [];
  } catch {
    return [];
  }
}

export function getLegacyRoasters(): Roaster[] {
  if (typeof window === 'undefined') return [];
  return readJson(STORAGE_KEY);
}

export function archiveLegacyRoasters(ids: string[]): void {
  const moving = new Set(ids);
  const legacy = readJson(STORAGE_KEY);
  try {
    window.localStorage.setItem(
      TRANSFERRED_KEY,
      JSON.stringify([...readJson(TRANSFERRED_KEY), ...legacy.filter((roaster) => moving.has(roaster.id))])
    );
    const rest = legacy.filter((roaster) => !moving.has(roaster.id));
    if (rest.length > 0) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — see archiveLegacyCoffeeShops.
  }
}

// Backward-compatible alias — most of the app still imports ROASTERS
// expecting the static seed list for demo/menu-picker purposes. Anything
// that needs live admin edits should use getRoasterById/getRoastersSnapshot
// instead.
export const ROASTERS = SEED_ROASTERS;
