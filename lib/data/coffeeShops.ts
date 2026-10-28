'use client';

import type { CoffeeShop } from '@/lib/types/coffee';
import type { CoffeeShopOrgRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

import { SEED_COFFEE_SHOPS } from './coffeeShopSeed';
import { COFFEE_SHOP_COLUMNS, mergePartners, rowToCoffeeShop } from './partnerRows';

export { SEED_COFFEE_SHOPS };

// Built-in shops merged with public.coffee_shops (0036_partner_directory.sql)
// — a database row replaces the built-in card with the same id. Every guest
// reads the same rows (public select), so the admin's "Активировать
// партнёра" / "Реестр партнёров" and a shop's own "Профиль на карте" reach
// /map for everyone. Writes go through server routes
// (app/api/admin/partners/**, app/api/cafe/map-profile); after one, call
// refreshCoffeeShops().
//
// The old screens kept their edits in this browser's localStorage under
// STORAGE_KEY. Those are no longer shown as live data — only offered for
// transfer (getLegacyCoffeeShops → /api/admin/partners/import), then moved
// to a backup key so nothing is lost.
const STORAGE_KEY = 'coffee-passport:coffee-shops';
const TRANSFERRED_KEY = `${STORAGE_KEY}:transferred`;

let remote: CoffeeShop[] = [];
let cache: CoffeeShop[] | null = null;
let loading: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  cache = null;
  listeners.forEach((listener) => listener());
}

export function refreshCoffeeShops(): Promise<void> {
  loading = (async () => {
    const { data, error } = await getBrowserSupabaseClient().from('coffee_shops').select(COFFEE_SHOP_COLUMNS);
    loaded = true;
    if (error || !data) {
      // Database unreachable (or 0036 not applied yet) — keep the built-in
      // cards rather than emptying the map.
      console.warn('[coffeeShops] database read failed', error?.message);
      return;
    }
    remote = (data as unknown as CoffeeShopOrgRow[]).map((row) =>
      rowToCoffeeShop(row, SEED_COFFEE_SHOPS.find((shop) => shop.id === row.slug))
    );
    notify();
  })();
  return loading;
}

function read(): CoffeeShop[] {
  if (typeof window === 'undefined') return SEED_COFFEE_SHOPS;
  if (!cache) cache = mergePartners(SEED_COFFEE_SHOPS, remote);
  return cache;
}

export function subscribeCoffeeShops(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded && !loading && typeof window !== 'undefined') void refreshCoffeeShops();
  return () => listeners.delete(listener);
}

export function getCoffeeShopsSnapshot(): CoffeeShop[] {
  return read();
}

export function getCoffeeShopsServerSnapshot(): CoffeeShop[] {
  return SEED_COFFEE_SHOPS;
}

export function getCoffeeShopById(id: string): CoffeeShop | undefined {
  return read().find((shop) => shop.id === id);
}

// Ids that already have a coffee_shops row (vs. built-in cards only).
export function isCoffeeShopInDatabase(id: string): boolean {
  return remote.some((shop) => shop.id === id);
}

// /map and other guest-facing pins: paused partners are hidden.
export function getMapCoffeeShops(shops: CoffeeShop[]): CoffeeShop[] {
  return shops.filter((shop) => shop.status === 'active');
}

function readJson(key: string): CoffeeShop[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CoffeeShop[]) : [];
  } catch {
    return [];
  }
}

export function getLegacyCoffeeShops(): CoffeeShop[] {
  if (typeof window === 'undefined') return [];
  return readJson(STORAGE_KEY);
}

export function archiveLegacyCoffeeShops(ids: string[]): void {
  const moving = new Set(ids);
  const legacy = readJson(STORAGE_KEY);
  try {
    window.localStorage.setItem(
      TRANSFERRED_KEY,
      JSON.stringify([...readJson(TRANSFERRED_KEY), ...legacy.filter((shop) => moving.has(shop.id))])
    );
    const rest = legacy.filter((shop) => !moving.has(shop.id));
    if (rest.length > 0) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the cards stay offered for transfer; the
    // import route skips ids already in the database.
  }
}

// Backward-compatible alias — most of the app still imports COFFEE_SHOPS
// expecting the static seed list (e.g. the shop picker in the taste flow).
// Anything that needs live partner data should use
// getCoffeeShopById/getCoffeeShopsSnapshot instead.
export const COFFEE_SHOPS = SEED_COFFEE_SHOPS;
