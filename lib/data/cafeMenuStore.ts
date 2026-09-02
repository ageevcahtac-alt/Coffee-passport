'use client';

// Which lots a coffee shop is currently serving, kept separate from the lot
// catalog itself (lib/data/lotsStore.ts) — a shop curates a subset of the
// shared, roaster-owned catalog rather than owning lots outright. No backend
// yet, so membership lives in localStorage, keyed by coffee shop id since a
// few demo shops exist (see lib/data/coffeeShops.ts).
//
// Each entry is a lotId -> isActiveInCafe boolean, not just a plain id list:
// a lot stays ON the shop's roster (so it keeps its check-in history, guest
// reviews, etc.) even after the shop flips it off with the "В меню кофейни"
// toggle — it just stops being guest-visible. This is deliberately the ONLY
// switch that controls guest-facing visibility (/passport, /taste, QR scan):
// a roaster pulling a lot from their own catalog (see Lot.inRoasterCatalog
// in lib/types/coffee.ts) must never cascade into hiding it here.

const STORAGE_KEY = 'coffee-passport:cafe-menu';

type ShopMenuEntries = Record<string, boolean>; // lotId -> isActiveInCafe

// XO Coffee starts with a small cross-roaster selection so the dashboard
// isn't empty on first load; every other shop starts with an empty menu.
const DEFAULT_MENU: Record<string, string[]> = {
  'shop-xo-vsevolozhsk': ['LOT-XO-ETH-001', 'LOT-XO-COL-004', 'LOT-NS-KEN-002', 'LOT-NS-ETH-003'],
};

// useSyncExternalStore requires getSnapshot to return a referentially stable
// value when nothing changed, or it re-renders forever — so every derived
// value below (default entries, the active-id list) is cached and only
// recomputed when the underlying override actually changes.
const EMPTY_IDS: string[] = [];

const defaultEntriesCache = new Map<string, ShopMenuEntries>();
function defaultEntries(shopId: string): ShopMenuEntries {
  let entries = defaultEntriesCache.get(shopId);
  if (!entries) {
    entries = {};
    for (const id of DEFAULT_MENU[shopId] ?? []) entries[id] = true;
    defaultEntriesCache.set(shopId, entries);
  }
  return entries;
}

let cache: Record<string, ShopMenuEntries> | null = null;
let activeIdsCache = new Map<string, string[]>();
const listeners = new Set<() => void>();

function readOverrides(): Record<string, ShopMenuEntries> {
  if (typeof window === 'undefined') return {};
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, ShopMenuEntries>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Record<string, ShopMenuEntries>) {
  cache = next;
  activeIdsCache = new Map();
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

// Every lot this shop has ever added to its menu, active or not — what the
// dashboard's "В меню кофейни" list shows and what add-lot.tsx checks
// against to avoid offering a re-add for a lot that's merely toggled off.
export function getMenuEntries(shopId: string): ShopMenuEntries {
  const overrides = readOverrides();
  return overrides[shopId] ?? defaultEntries(shopId);
}

// Guest-facing membership: only lots the coffee shop currently toggled ON.
// This is the sole gate for /passport, /taste and the QR-scan flow — see
// ScanLotModal.tsx.
export function getMenuLotIds(shopId: string): string[] {
  const cached = activeIdsCache.get(shopId);
  if (cached) return cached;
  const entries = getMenuEntries(shopId);
  const ids = Object.keys(entries).filter((id) => entries[id]);
  const result = ids.length > 0 ? ids : EMPTY_IDS;
  activeIdsCache.set(shopId, result);
  return result;
}

export function getServerMenuLotIds(shopId: string): string[] {
  return DEFAULT_MENU[shopId] ?? EMPTY_IDS;
}

export function addLotToMenu(shopId: string, lotId: string): void {
  const current = getMenuEntries(shopId);
  if (current[lotId]) return;
  write({ ...readOverrides(), [shopId]: { ...current, [lotId]: true } });
}

// The coffee shop's own "В меню кофейни" toggle — independent of whatever
// the roaster's catalog flag says (see Lot.inRoasterCatalog). Keeps the
// entry (and its history) on the roster either way, per the task's "shelf
// inventory can outlive the roaster's catalog entry" requirement.
export function setMenuLotActive(shopId: string, lotId: string, isActive: boolean): void {
  const current = getMenuEntries(shopId);
  write({ ...readOverrides(), [shopId]: { ...current, [lotId]: isActive } });
}
