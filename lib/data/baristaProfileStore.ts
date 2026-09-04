'use client';

import type { Barista } from '@/lib/types/coffee';
import type { BaristaProfileRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { BARISTAS } from './baristas';

// Personal-preference overrides (favoriteOrigin/favoriteBrewMethod/avatarUrl)
// on top of the static BARISTAS roster — same "localStorage cache + best-
// effort Supabase write-through" shape as brewingRecipesStore.ts, backed by
// public.barista_profiles (see supabase/migrations/0015_barista_profiles.sql).
// A barista's id/name/coffeeShopId still come from BARISTAS (there is no
// self-service "create a new barista" flow yet — see lib/data/staff.ts for
// that gap); this store only ever overlays the profile fields on top.

const STORAGE_KEY = 'coffee-passport:barista-profiles';

let cache: Barista[] | null = null;
const listeners = new Set<() => void>();

type ProfileFields = Pick<Barista, 'favoriteOrigin' | 'favoriteBrewMethod' | 'avatarUrl'>;

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
  return BARISTAS.map((barista) => {
    const override = overrides[barista.id];
    return override ? { ...barista, ...override } : barista;
  });
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

function rowToProfileFields(row: BaristaProfileRow): ProfileFields {
  return {
    favoriteOrigin: row.favorite_origin,
    favoriteBrewMethod: row.favorite_brew_method as Barista['favoriteBrewMethod'],
    avatarUrl: row.avatar_url,
  };
}

// Pulls every barista_profiles row (public read, no auth needed — see the
// migration) and overlays it onto the local cache. Safe to call from any
// guest-facing page (Success Screen, saved drink card) as well as staff
// dashboards.
export async function syncBaristaProfilesFromSupabase(): Promise<void> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('barista_profiles').select('*');
    if (error || !data) return;
    const overrides = readOverrides();
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
