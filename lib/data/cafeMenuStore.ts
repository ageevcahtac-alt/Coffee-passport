'use client';

import type { LotMenuStatus } from '@/lib/types/coffee';
import type { CafeMenuEntryRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// Which lots a coffee shop is currently serving, kept separate from the lot
// catalog itself (lib/data/lotsStore.ts) — a shop curates a subset of the
// shared, roaster-owned catalog rather than owning lots outright.
//
// Each entry is a lotId -> CafeMenuEntry, not just a plain id list: a lot
// stays ON the shop's roster (so it keeps its check-in history, guest
// reviews, etc.) even after the shop flips it off with the "В меню кофейни"
// toggle — it just stops being guest-visible. isActive is deliberately the
// ONLY switch that controls guest-facing visibility (/passport, /taste, QR
// scan): a roaster pulling a lot from their own catalog (see
// Lot.inRoasterCatalog in lib/types/coffee.ts) must never cascade into
// hiding it here.
//
// `status` (new/active/discontinuing) is a second, independent axis — a
// lifecycle label only meaningful while isActive is true, backing the cafe
// dashboard's status control and the guest-facing "Обновления на баре"
// announcements (see lib/utils/shopAnnouncements.ts). Backed by Supabase's
// public.cafe_menu_entries (see supabase/migrations/0017_cafe_menu_entries.sql)
// — unlike the pure-localStorage store this used to be, a guest on a
// different device/account needs to see a cafe's status change, so
// localStorage is now a read cache, not the source of truth, same pattern
// as lib/data/brewingRecipesStore.ts.

export interface CafeMenuEntry {
  isActive: boolean;
  status: LotMenuStatus;
  statusChangedAt: string; // ISO timestamp
  // Only ever set while status === 'discontinuing' — see
  // supabase/migrations/0018_cafe_menu_scheduled_removal.sql and
  // components/coffee/CountdownTimer.tsx. setMenuLotStatus below forces
  // this back to null for every other status, so callers never need to
  // remember to clear it themselves.
  scheduledRemovalAt: string | null;
}

type ShopMenuEntries = Record<string, CafeMenuEntry>; // lotId -> entry

const STORAGE_KEY = 'coffee-passport:cafe-menu';

// XO Coffee starts with a small cross-roaster selection so the dashboard
// isn't empty on first load; every other shop starts with an empty menu.
const DEFAULT_MENU: Record<string, string[]> = {
  'shop-xo-vsevolozhsk': ['LOT-XO-ETH-001', 'LOT-XO-COL-004', 'LOT-NS-KEN-002', 'LOT-NS-ETH-003'],
};

function defaultEntry(): CafeMenuEntry {
  return { isActive: true, status: 'active', statusChangedAt: new Date(0).toISOString(), scheduledRemovalAt: null };
}

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
    for (const id of DEFAULT_MENU[shopId] ?? []) entries[id] = defaultEntry();
    defaultEntriesCache.set(shopId, entries);
  }
  return entries;
}

let cache: Record<string, ShopMenuEntries> | null = null;
let activeIdsCache = new Map<string, string[]>();
const listeners = new Set<() => void>();

// Back-fills the old plain-boolean shape (lotId -> isActiveInCafe) that may
// still be sitting in a browser's localStorage from before `status`
// existed — same defensive normalize-on-read idiom as lotsStore.ts's
// normalizeLot.
function normalizeShopEntries(raw: Record<string, boolean | Partial<CafeMenuEntry>>): ShopMenuEntries {
  const normalized: ShopMenuEntries = {};
  for (const [lotId, value] of Object.entries(raw)) {
    normalized[lotId] =
      typeof value === 'boolean'
        ? { isActive: value, status: 'active', statusChangedAt: new Date(0).toISOString(), scheduledRemovalAt: null }
        : {
            isActive: value.isActive ?? true,
            status: value.status ?? 'active',
            statusChangedAt: value.statusChangedAt ?? new Date(0).toISOString(),
            scheduledRemovalAt: value.scheduledRemovalAt ?? null,
          };
  }
  return normalized;
}

function readOverrides(): Record<string, ShopMenuEntries> {
  if (typeof window === 'undefined') return {};
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, boolean | CafeMenuEntry>>) : {};
    cache = Object.fromEntries(
      Object.entries(parsed).map(([shopId, entries]) => [shopId, normalizeShopEntries(entries)])
    );
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
  const ids = Object.keys(entries).filter((id) => entries[id].isActive);
  const result = ids.length > 0 ? ids : EMPTY_IDS;
  activeIdsCache.set(shopId, result);
  return result;
}

export function getServerMenuLotIds(shopId: string): string[] {
  return DEFAULT_MENU[shopId] ?? EMPTY_IDS;
}

function rowToEntry(row: CafeMenuEntryRow): CafeMenuEntry {
  return {
    isActive: row.is_active,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    scheduledRemovalAt: row.scheduled_removal_at,
  };
}

// Pulls every entry for this shop from Supabase (public read, no auth
// needed — see the migration) and overlays it onto the local cache. Safe
// to call from any surface that reads this shop's menu: the cafe's own
// dashboard, the guest-facing catalog, the map panel, the supply widget.
export async function syncCafeMenuFromSupabase(shopId: string): Promise<void> {
  if (!shopId) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('cafe_menu_entries').select('*').eq('coffee_shop_id', shopId);
    if (error || !data) return;
    const overrides = readOverrides();
    const shopEntries = { ...(overrides[shopId] ?? defaultEntries(shopId)) };
    for (const row of data as CafeMenuEntryRow[]) {
      shopEntries[row.lot_id] = rowToEntry(row);
    }
    write({ ...overrides, [shopId]: shopEntries });
  } catch {
    // Offline / table not migrated yet — local cache stands.
  }
}

function writeThroughEntry(shopId: string, lotId: string, entry: CafeMenuEntry): void {
  const row: CafeMenuEntryRow = {
    id: `menu-${generateId()}`,
    coffee_shop_id: shopId,
    lot_id: lotId,
    is_active: entry.isActive,
    status: entry.status,
    status_changed_at: entry.statusChangedAt,
    scheduled_removal_at: entry.scheduledRemovalAt,
    created_at: entry.statusChangedAt,
    updated_at: new Date().toISOString(),
  };

  void getBrowserSupabaseClient()
    .from('cafe_menu_entries')
    .upsert(row, { onConflict: 'coffee_shop_id,lot_id' })
    .then(({ error }) => {
      if (error) {
        console.warn('[cafe_menu_entries] Supabase write failed, kept local-only:', error.message);
      }
    });
}

export function addLotToMenu(shopId: string, lotId: string): void {
  const current = getMenuEntries(shopId);
  if (current[lotId]) return;
  const entry: CafeMenuEntry = {
    isActive: true,
    status: 'new',
    statusChangedAt: new Date().toISOString(),
    scheduledRemovalAt: null,
  };
  write({ ...readOverrides(), [shopId]: { ...current, [lotId]: entry } });
  writeThroughEntry(shopId, lotId, entry);
}

// The coffee shop's own "В меню кофейни" toggle — independent of whatever
// the roaster's catalog flag says (see Lot.inRoasterCatalog). Keeps the
// entry (and its history) on the roster either way, per the task's "shelf
// inventory can outlive the roaster's catalog entry" requirement.
export function setMenuLotActive(shopId: string, lotId: string, isActive: boolean): void {
  const current = getMenuEntries(shopId);
  const existing = current[lotId] ?? defaultEntry();
  const entry: CafeMenuEntry = { ...existing, isActive };
  write({ ...readOverrides(), [shopId]: { ...current, [lotId]: entry } });
  writeThroughEntry(shopId, lotId, entry);
}

// The lifecycle status control — "Новинка / Активен / Выводим" (see
// components/cafe/LotStatusControl.tsx). Stamps statusChangedAt so history
// isn't lost even though nothing reads it yet beyond "is this the current
// status." scheduledRemovalAt is only meaningful for 'discontinuing' —
// forced to null for every other status here, so a caller flipping back to
// 'active'/'new' can never accidentally leave a stale removal date behind
// (which would otherwise silently re-arm cafe_menu_expire_discontinuing()
// the next time status went back to 'discontinuing' without a fresh date).
export function setMenuLotStatus(
  shopId: string,
  lotId: string,
  status: LotMenuStatus,
  scheduledRemovalAt: string | null = null
): void {
  const current = getMenuEntries(shopId);
  const existing = current[lotId] ?? defaultEntry();
  const entry: CafeMenuEntry = {
    ...existing,
    status,
    statusChangedAt: new Date().toISOString(),
    scheduledRemovalAt: status === 'discontinuing' ? scheduledRemovalAt : null,
  };
  write({ ...readOverrides(), [shopId]: { ...current, [lotId]: entry } });
  writeThroughEntry(shopId, lotId, entry);
}
