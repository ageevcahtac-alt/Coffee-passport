'use client';

import type { Lot, LotMenuStatus } from '@/lib/types/coffee';
import type { CafeMenuEntryRoasterStatusViewRow, CafeMenuEntryRow, LotStatus } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { findCanonicalLotByPublicId } from '@/lib/data/canonicalLotStore';
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
  // Read-only signal derived from the Canonical Lot's own live status —
  // see cafe_menu_entries_roaster_status_view and
  // CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md. Never set by
  // addLotToMenu/setMenuLotActive/setMenuLotStatus below — only ever
  // populated by syncCafeMenuFromSupabase reading the view. Undefined
  // until that sync has run at least once for this shop; treat
  // "undefined/unknown" the same as "no warning", never the same as
  // "archived" — only an explicit 'archived' value means the roaster
  // actually archived it.
  roasterLotStatus?: LotStatus | null;
  roasterInCatalog?: boolean | null;
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

function rowToEntry(row: CafeMenuEntryRow, roasterStatus?: { status: LotStatus | null; inCatalog: boolean | null }): CafeMenuEntry {
  return {
    isActive: row.is_active,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    scheduledRemovalAt: row.scheduled_removal_at,
    roasterLotStatus: roasterStatus?.status,
    roasterInCatalog: roasterStatus?.inCatalog,
  };
}

// Pulls every entry for this shop from Supabase, preferring the read-only
// view that additionally joins in the Canonical Lot's own live status
// (see supabase/migrations/0027_cafe_menu_entries_roaster_status_view.sql)
// — public read, no auth needed, same as the base table before it. Safe
// to call from any surface that reads this shop's menu: the cafe's own
// dashboard, the guest-facing catalog, the map panel, the supply widget.
// This only ever reads; it never writes cafe_menu_entries.is_active/
// status/scheduled_removal_at based on what it finds.
//
// Falls back to the plain base table if the view isn't live yet on this
// Supabase project (migration 0027 not applied there yet) — deliberately
// so the café's own already-working lifecycle sync (is_active/status/
// scheduled_removal_at) can never regress just because the new derived
// signal isn't available yet; roasterLotStatus/roasterInCatalog simply
// stay undefined in that case, which CafeMenuEntry's own contract already
// treats as "no warning", never "archived".
export async function syncCafeMenuFromSupabase(shopId: string): Promise<void> {
  if (!shopId) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const overrides = readOverrides();
    const shopEntries = { ...(overrides[shopId] ?? defaultEntries(shopId)) };

    const viewResult = await supabase
      .from('cafe_menu_entries_roaster_status_view')
      .select('*')
      .eq('coffee_shop_id', shopId);

    if (!viewResult.error && viewResult.data) {
      for (const row of viewResult.data as CafeMenuEntryRoasterStatusViewRow[]) {
        shopEntries[row.lot_id] = rowToEntry(row, { status: row.roaster_lot_status, inCatalog: row.roaster_in_catalog });
      }
      write({ ...overrides, [shopId]: shopEntries });
      return;
    }

    const { data, error } = await supabase.from('cafe_menu_entries').select('*').eq('coffee_shop_id', shopId);
    if (error || !data) return;
    for (const row of data as CafeMenuEntryRow[]) {
      shopEntries[row.lot_id] = rowToEntry(row);
    }
    write({ ...overrides, [shopId]: shopEntries });
  } catch {
    // Offline / neither table nor view reachable — local cache stands.
  }
}

// Production readiness hardening (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md):
// RoasterSupplyMapWidget used to mount one row per coffee shop and have
// each row call syncCafeMenuFromSupabase(shop.id) independently — a real
// N+1 (one round trip per shop in the whole system, on every roaster
// dashboard load, regardless of whether that shop carries any of this
// roaster's lots). This is the same read, scoped the other way around:
// every menu-entry row across every shop for a given SET of lot ids, in
// one request, grouped back into each shop's own cache bucket. Same
// view-then-base-table fallback as syncCafeMenuFromSupabase.
//
// A shop with zero matching rows never appears in the result and is left
// untouched here — its cache entry stays whatever it already was (default
// "no menu data synced yet"), exactly as if its own per-shop sync simply
// hadn't run yet. That's correct: this function only ever tells you about
// shops that DO carry at least one of these lots.
export async function syncCafeMenuEntriesForLots(lotIds: string[]): Promise<void> {
  if (lotIds.length === 0) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const overrides = { ...readOverrides() };

    const viewResult = await supabase
      .from('cafe_menu_entries_roaster_status_view')
      .select('*')
      .in('lot_id', lotIds);

    if (!viewResult.error && viewResult.data) {
      for (const row of viewResult.data as CafeMenuEntryRoasterStatusViewRow[]) {
        const shopEntries = { ...(overrides[row.coffee_shop_id] ?? defaultEntries(row.coffee_shop_id)) };
        shopEntries[row.lot_id] = rowToEntry(row, { status: row.roaster_lot_status, inCatalog: row.roaster_in_catalog });
        overrides[row.coffee_shop_id] = shopEntries;
      }
      write(overrides);
      return;
    }

    const { data, error } = await supabase.from('cafe_menu_entries').select('*').in('lot_id', lotIds);
    if (error || !data) return;
    for (const row of data as CafeMenuEntryRow[]) {
      const shopEntries = { ...(overrides[row.coffee_shop_id] ?? defaultEntries(row.coffee_shop_id)) };
      shopEntries[row.lot_id] = rowToEntry(row);
      overrides[row.coffee_shop_id] = shopEntries;
    }
    write(overrides);
  } catch {
    // Offline / neither table nor view reachable — local cache stands.
  }
}

// `lotRef` is deliberately optional and, when omitted, left OUT of the
// row object entirely (not set to `null`) — see the call sites below.
// Supabase's upsert only touches columns present in the payload, so
// omitting the key means an update-only call (setMenuLotActive/
// setMenuLotStatus, neither of which ever knows the Canonical Lot's uuid)
// can never clobber a lot_ref a prior addLotToMenu call already resolved
// and wrote for this same entry.
// Production readiness hardening (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md):
// addLotToMenu/setMenuLotActive/setMenuLotStatus are synchronous, fire an
// unguarded upsert each, and are called straight from onClick handlers
// with no in-flight tracking anywhere up the call chain — rapidly
// toggling one entry (e.g. new -> active -> discontinuing) used to issue
// concurrent upserts for the same (coffee_shop_id, lot_id) row with no
// ordering guarantee, so an out-of-order response could leave Supabase on
// an intermediate status rather than the barista's actual final choice,
// with no error surfaced (each individual upsert "succeeds"). Requests
// for the same entry are now serialized here, coalescing anything that
// arrives while one is already in flight down to just the latest row —
// so the entry's Supabase state always converges on the last call made,
// in order, regardless of network response timing.
const pendingWrites = new Map<string, { inFlight: boolean; nextRow: CafeMenuEntryRow | null }>();

function sendRow(key: string, row: CafeMenuEntryRow): void {
  void getBrowserSupabaseClient()
    .from('cafe_menu_entries')
    .upsert(row, { onConflict: 'coffee_shop_id,lot_id' })
    .then(({ error }) => {
      if (error) {
        console.warn('[cafe_menu_entries] Supabase write failed, kept local-only:', error.message);
      }
      const state = pendingWrites.get(key);
      if (state?.nextRow) {
        const next = state.nextRow;
        state.nextRow = null;
        sendRow(key, next);
      } else if (state) {
        state.inFlight = false;
      }
    });
}

function writeThroughEntry(shopId: string, lotId: string, entry: CafeMenuEntry, lotRef?: string | null): void {
  const row: CafeMenuEntryRow = {
    id: `menu-${generateId()}`,
    coffee_shop_id: shopId,
    lot_id: lotId,
    ...(lotRef !== undefined ? { lot_ref: lotRef } : {}),
    is_active: entry.isActive,
    status: entry.status,
    status_changed_at: entry.statusChangedAt,
    scheduled_removal_at: entry.scheduledRemovalAt,
    created_at: entry.statusChangedAt,
    updated_at: new Date().toISOString(),
  };

  const key = `${shopId}:${lotId}`;
  const state = pendingWrites.get(key);
  if (state?.inFlight) {
    state.nextRow = row;
    return;
  }
  pendingWrites.set(key, { inFlight: true, nextRow: null });
  sendRow(key, row);
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
  // Resolves the Canonical Lot's real uuid so this brand-new entry can
  // carry a real lot_ref from creation on — see
  // CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md §3. Best-effort and
  // non-blocking: the local entry (and the base write-through below) are
  // already committed regardless of whether this resolves; a Lot with no
  // canonical row yet (or an offline lookup) just leaves lot_ref null,
  // identical to every entry created before this existed.
  void findCanonicalLotByPublicId(lotId)
    .then((canonicalLot) => writeThroughEntry(shopId, lotId, entry, canonicalLot?.id ?? null))
    .catch(() => writeThroughEntry(shopId, lotId, entry, null));
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

// Shared "is this menu entry's underlying Lot no longer offered by the
// roaster" signal — CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md. Used by
// both the café's own dashboard (the existing "Снято с производства
// обжарщиком" badge, previously blind to an outright archived Lot) and
// the café's public guest-facing menu. Purely a read-only label: it never
// changes `entry.isActive`/`entry.status`/`entry.scheduledRemovalAt`, and
// callers must never do so either just because this returns true — the
// café's own menu-entry lifecycle stays entirely under its own control.
// `entry` being undefined/not-yet-synced is deliberately treated the same
// as "no warning", never as "archived".
export function isDiscontinuedByRoaster(lot: Lot, entry: CafeMenuEntry | undefined): boolean {
  return !lot.inRoasterCatalog || entry?.roasterLotStatus === 'archived';
}
