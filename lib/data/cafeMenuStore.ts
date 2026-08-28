'use client';

// Which lots a coffee shop is currently serving, kept separate from the lot
// catalog itself (lib/data/lotsStore.ts) — a shop curates a subset of the
// shared, roaster-owned catalog rather than owning lots outright. No backend
// yet, so membership lives in localStorage, keyed by coffee shop id since a
// few demo shops exist (see lib/data/coffeeShops.ts).

const STORAGE_KEY = 'coffee-passport:cafe-menu';

// XO Coffee starts with a small cross-roaster selection so the dashboard
// isn't empty on first load; every other shop starts with an empty menu.
const DEFAULT_MENU: Record<string, string[]> = {
  'shop-xo-vsevolozhsk': ['LOT-XO-ETH-001', 'LOT-XO-COL-004', 'LOT-NS-KEN-002', 'LOT-NS-ETH-003'],
};

// useSyncExternalStore requires getServerSnapshot to return a referentially
// stable value — a fresh `[]` literal on every call (the fallback below)
// trips React's "should be cached to avoid an infinite loop" warning.
const EMPTY_IDS: string[] = [];

let cache: Record<string, string[]> | null = null;
const listeners = new Set<() => void>();

function read(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Record<string, string[]>) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

export function getMenuLotIds(shopId: string): string[] {
  const overrides = read();
  return overrides[shopId] ?? DEFAULT_MENU[shopId] ?? EMPTY_IDS;
}

export function getServerMenuLotIds(shopId: string): string[] {
  return DEFAULT_MENU[shopId] ?? EMPTY_IDS;
}

export function addLotToMenu(shopId: string, lotId: string): void {
  const current = read();
  const existing = current[shopId] ?? DEFAULT_MENU[shopId] ?? [];
  if (existing.includes(lotId)) return;
  write({ ...current, [shopId]: [...existing, lotId] });
}

export function removeLotFromMenu(shopId: string, lotId: string): void {
  const current = read();
  const existing = current[shopId] ?? DEFAULT_MENU[shopId] ?? [];
  write({ ...current, [shopId]: existing.filter((id) => id !== lotId) });
}
