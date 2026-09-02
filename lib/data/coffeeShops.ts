'use client';

import type { CoffeeShop } from '@/lib/types/coffee';

export const SEED_COFFEE_SHOPS: CoffeeShop[] = [
  {
    id: 'shop-xo-vsevolozhsk',
    name: 'XO Coffee',
    city: 'Всеволожск',
    brandColor: '#D4AF37',
    lat: 60.0167,
    lng: 30.6394,
    address: 'г. Всеволожск, Колтушское шоссе, 1',
    phone: '+7 800 555-01-01',
    website: 'https://xo-coffee.example',
    instagramUrl: '',
    telegramUrl: '',
    description: 'Пилотная кофейня программы Coffee Passport — зерно от нескольких обжарщиков, фильтр и эспрессо.',
    workingHours: 'Пн–Вс 8:00–20:00',
    photos: [],
  },
  {
    id: 'shop-a-spb',
    name: 'Coffee Shop A',
    city: 'Санкт-Петербург',
    brandColor: '#00A896',
    lat: 59.9311,
    lng: 30.3609,
    address: '',
    phone: '',
    website: '',
    instagramUrl: '',
    telegramUrl: '',
    description: '',
    workingHours: '',
    photos: [],
  },
  {
    id: 'shop-b-peterhof',
    name: 'Coffee Shop B',
    city: 'Петергоф',
    brandColor: '#E63946',
    lat: 59.8848,
    lng: 29.9099,
    address: '',
    phone: '',
    website: '',
    instagramUrl: '',
    telegramUrl: '',
    description: '',
    workingHours: '',
    photos: [],
  },
];

// Seed shops merged with anything the admin panel (Реестр партнёров /
// Активировать партнёра) or a shop's own "Профиль на карте" screen
// (app/dashboard/cafe/(hub)/map-profile) saved to localStorage — same
// override-on-seed idiom as lib/data/lotsStore.ts / lib/data/roasters.ts.
const STORAGE_KEY = 'coffee-passport:coffee-shops';

// CoffeeShop has grown fields since this store's earliest deploys (map
// profile: lat/lng/address/etc.) — a browser with an old-shaped override in
// localStorage would otherwise hand out a shop missing them. Backfilling
// here, once, means every consumer trusts the CoffeeShop type instead of
// re-guessing a fallback (same idiom as lotsStore.ts's normalizeLot).
function normalizeShop(shop: CoffeeShop): CoffeeShop {
  return {
    ...shop,
    lat: shop.lat ?? null,
    lng: shop.lng ?? null,
    address: shop.address ?? '',
    phone: shop.phone ?? '',
    website: shop.website ?? '',
    instagramUrl: shop.instagramUrl ?? '',
    telegramUrl: shop.telegramUrl ?? '',
    description: shop.description ?? '',
    workingHours: shop.workingHours ?? '',
    photos: shop.photos ?? [],
  };
}

let cache: CoffeeShop[] | null = null;
const listeners = new Set<() => void>();

function readOverrides(): CoffeeShop[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CoffeeShop[]) : [];
    return parsed.map(normalizeShop);
  } catch {
    return [];
  }
}

function computeAll(): CoffeeShop[] {
  const merged = new Map<string, CoffeeShop>();
  for (const shop of SEED_COFFEE_SHOPS) merged.set(shop.id, shop);
  for (const shop of readOverrides()) merged.set(shop.id, shop);
  return Array.from(merged.values());
}

function read(): CoffeeShop[] {
  if (typeof window === 'undefined') return SEED_COFFEE_SHOPS;
  if (!cache) cache = computeAll();
  return cache;
}

export function subscribeCoffeeShops(listener: () => void): () => void {
  listeners.add(listener);
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

export function saveCoffeeShop(shop: CoffeeShop): void {
  const overrides = readOverrides();
  const index = overrides.findIndex((existing) => existing.id === shop.id);
  if (index >= 0) overrides[index] = shop;
  else overrides.push(shop);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — the in-memory cache below still reflects the
    // save for the rest of this session.
  }
  cache = computeAll();
  listeners.forEach((listener) => listener());
}

export function generateCoffeeShopId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  const existingIds = new Set(read().map((shop) => shop.id));
  let id = `shop-${slug || 'partner'}`;
  let sequence = 2;
  while (existingIds.has(id)) {
    id = `shop-${slug || 'partner'}-${sequence}`;
    sequence += 1;
  }
  return id;
}

// Backward-compatible alias — most of the app still imports COFFEE_SHOPS
// expecting the static seed list (e.g. the shop picker in the taste flow).
// Anything that needs live admin edits should use
// getCoffeeShopById/getCoffeeShopsSnapshot instead.
export const COFFEE_SHOPS = SEED_COFFEE_SHOPS;
