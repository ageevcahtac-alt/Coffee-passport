'use client';

import type { Barista } from '@/lib/types/coffee';
import type { BaristaProfileRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { BARISTAS, UNSPECIFIED_BARISTA_ID } from './baristas';

// Personal-preference overrides (favoriteOrigin/favoriteBrewMethod/avatarUrl)
// on top of the static BARISTAS roster — same "localStorage cache + best-
// effort Supabase write-through" shape as brewingRecipesStore.ts, backed by
// public.barista_profiles (see supabase/migrations/0015_barista_profiles.sql).
// A seed barista's id/name/coffeeShopId still come from BARISTAS; this store
// only overlays the profile fields on top. A barista the cafe created from
// its cabinet (app/api/cafe/staff/barista-accounts) has no seed entry — the
// synced row's name/coffeeShopId make it a full roster entry instead.

const STORAGE_KEY = 'coffee-passport:barista-profiles';
const ROSTER_PAGE = 500;

let cache: Barista[] | null = null;
const listeners = new Set<() => void>();

type ProfileFields = Pick<Barista, 'favoriteOrigin' | 'favoriteBrewMethod' | 'avatarUrl'> &
  Partial<Pick<Barista, 'name' | 'coffeeShopId'>>;

function readOverrides(): Record<string, ProfileFields> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProfileFields>) : {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Record<string, ProfileFields>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — the in-memory cache below still reflects the
    // save for the rest of this session.
  }
}

function computeAll(): Barista[] {
  const overrides = readOverrides();
  const seeded = BARISTAS.map((barista) => {
    const override = overrides[barista.id];
    return override
      ? {
          ...barista,
          favoriteOrigin: override.favoriteOrigin,
          favoriteBrewMethod: override.favoriteBrewMethod,
          avatarUrl: override.avatarUrl,
        }
      : barista;
  });
  const seedIds = new Set(BARISTAS.map((barista) => barista.id));
  const created = Object.entries(overrides)
    .filter(([id, override]) => !seedIds.has(id) && override.name && override.coffeeShopId)
    .map(([id, override]) => ({ ...override, id, name: override.name!, coffeeShopId: override.coffeeShopId! }));
  return [...seeded, ...created];
}

function read(): Barista[] {
  if (typeof window === 'undefined') return BARISTAS;
  if (!cache) cache = computeAll();
  return cache;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Barista[] {
  return read();
}

export function getServerSnapshot(): Barista[] {
  return BARISTAS;
}

export function getMergedBaristaById(id: string): Barista | undefined {
  return read().find((barista) => barista.id === id);
}

export function getMergedBaristasForShop(coffeeShopId: string): Barista[] {
  return read().filter((barista) => barista.coffeeShopId === coffeeShopId);
}

// Guest rating form: the shop's roster (seed + every barista_profiles row of
// that shop, so a barista the cafe just created is there) and 'Не указан' last.
export function baristaChoicesFrom(roster: Barista[], coffeeShopId: string): Barista[] {
  return [
    ...roster.filter((barista) => barista.coffeeShopId === coffeeShopId),
    ...roster.filter((barista) => barista.id === UNSPECIFIED_BARISTA_ID),
  ];
}

export function getBaristaChoicesForShop(coffeeShopId: string): Barista[] {
  return baristaChoicesFrom(read(), coffeeShopId);
}

function rowToProfileFields(row: BaristaProfileRow): ProfileFields {
  return {
    favoriteOrigin: row.favorite_origin,
    favoriteBrewMethod: row.favorite_brew_method as Barista['favoriteBrewMethod'],
    avatarUrl: row.avatar_url,
    name: row.name,
    coffeeShopId: row.coffee_shop_id,
  };
}

// Pulls every barista_profiles row (public read, no auth needed — see the
// migration) and overlays it onto the local cache. Safe to call from any
// guest-facing page (Success Screen, saved drink card) as well as staff
// dashboards.
export async function syncBaristaProfilesFromSupabase(): Promise<void> {
  try {
    const supabase = getBrowserSupabaseClient();
    // Page by page: PostgREST caps one response, and an id missing from a
    // capped page must not count as removed below. Any failed page — keep the
    // local cache as it is.
    const data: BaristaProfileRow[] = [];
    for (let from = 0; ; from += ROSTER_PAGE) {
      const page = await supabase
        .from('barista_profiles')
        .select('*')
        .order('id')
        .range(from, from + ROSTER_PAGE - 1);
      if (page.error || !page.data) return;
      data.push(...(page.data as BaristaProfileRow[]));
      if (page.data.length < ROSTER_PAGE) break;
    }
    // The database is the roster: a non-seed barista it no longer has (login
    // removed by the cafe) leaves the local cache too. Seed overrides stay.
    const seedIds = new Set(BARISTAS.map((barista) => barista.id));
    const overrides = Object.fromEntries(Object.entries(readOverrides()).filter(([id]) => seedIds.has(id)));
    for (const row of data as BaristaProfileRow[]) {
      overrides[row.id] = rowToProfileFields(row);
    }
    writeOverrides(overrides);
    cache = computeAll();
    listeners.forEach((listener) => listener());
  } catch {
    // Offline / table not migrated yet — local cache stands.
  }
}

// Saves the full profile (id/coffeeShopId/name come along for the ride so
// the row is self-describing, but only the three preference fields are
// ever actually edited — see components/barista/BaristaProfileForm.tsx).
export function saveBaristaProfile(barista: Barista): void {
  const overrides = readOverrides();
  overrides[barista.id] = {
    name: barista.name,
    coffeeShopId: barista.coffeeShopId,
    favoriteOrigin: barista.favoriteOrigin,
    favoriteBrewMethod: barista.favoriteBrewMethod,
    avatarUrl: barista.avatarUrl,
  };
  writeOverrides(overrides);
  cache = computeAll();
  listeners.forEach((listener) => listener());

  const row: BaristaProfileRow = {
    id: barista.id,
    coffee_shop_id: barista.coffeeShopId,
    name: barista.name,
    favorite_origin: barista.favoriteOrigin,
    favorite_brew_method: barista.favoriteBrewMethod,
    avatar_url: barista.avatarUrl,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  void getBrowserSupabaseClient()
    .from('barista_profiles')
    .upsert(row)
    .then(({ error }) => {
      if (error) {
        console.warn('[barista_profiles] Supabase write failed, kept local-only:', error.message);
      }
    });
}
