'use client';

import type { LotNotificationReadRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// Per-user read/dismiss state for one NEW_CAFE_LOT announcement
// OCCURRENCE — see supabase/migrations/0032_notification_center.sql for
// why the key includes statusChangedAt (a lot re-marked 'new' later is a
// fresh occurrence, not the same notification re-appearing).
//
// Deliberately does NOT store the announcement's own content (shop name,
// lot, status) — cafe_menu_entries (via lib/utils/shopAnnouncements.ts)
// stays the single source of truth for "what the announcement says"; this
// store only ever tracks "has this user read/dismissed this occurrence."
//
// Same local-cache-first, sync-only-when-authenticated pattern as every
// other store here. Read/dismiss state is treated as low-value UI state
// (unlike a mute preference, losing it just means a few old notifications
// re-appear as unread) — deliberately no claim-on-signin flow for an
// anonymous guest's pre-signup read state, to keep this store small.

export interface LotNotificationReadState {
  userId: string;
  coffeeShopId: string;
  lotId: string;
  statusChangedAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

export function notificationKey(coffeeShopId: string, lotId: string, statusChangedAt: string): string {
  return `${coffeeShopId}::${lotId}::${statusChangedAt}`;
}

const STORAGE_KEY = 'coffee-passport:lot-notification-reads';

let cache: LotNotificationReadState[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: LotNotificationReadState[] = [];

function read(): LotNotificationReadState[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as LotNotificationReadState[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(records: LotNotificationReadState[]) {
  cache = records;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable — in-memory cache still reflects the change for
    // the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): LotNotificationReadState[] {
  return read();
}

export function getServerSnapshot(): LotNotificationReadState[] {
  return EMPTY;
}

function upsertLocal(
  userId: string,
  coffeeShopId: string,
  lotId: string,
  statusChangedAt: string,
  patch: Partial<Pick<LotNotificationReadState, 'readAt' | 'dismissedAt'>>
): LotNotificationReadState {
  const existing = read().find(
    (r) =>
      r.userId === userId &&
      r.coffeeShopId === coffeeShopId &&
      r.lotId === lotId &&
      r.statusChangedAt === statusChangedAt
  );
  const next: LotNotificationReadState = {
    userId,
    coffeeShopId,
    lotId,
    statusChangedAt,
    readAt: existing?.readAt ?? null,
    dismissedAt: existing?.dismissedAt ?? null,
    ...patch,
  };
  const others = read().filter((r) => r !== existing);
  write([...others, next]);
  return next;
}

function sendRow(row: LotNotificationReadRow): void {
  void getBrowserSupabaseClient()
    .from('lot_notification_reads')
    .upsert(row, { onConflict: 'user_id,coffee_shop_id,lot_id,status_changed_at' })
    .then(({ error }) => {
      if (error) {
        console.warn('[lot_notification_reads] Supabase write failed, kept local-only:', error.message);
      }
    });
}

// Marks exactly one occurrence read — opening one notification never marks
// any other one read (see BarUpdatesPanel/NotificationCenter call sites).
export function markLotNotificationRead(
  userId: string,
  coffeeShopId: string,
  lotId: string,
  statusChangedAt: string,
  isAuthenticated: boolean
): void {
  const readAt = new Date().toISOString();
  const next = upsertLocal(userId, coffeeShopId, lotId, statusChangedAt, { readAt });
  if (!isAuthenticated) return;
  sendRow({
    user_id: userId,
    coffee_shop_id: coffeeShopId,
    lot_id: lotId,
    status_changed_at: statusChangedAt,
    read_at: next.readAt,
    dismissed_at: next.dismissedAt,
    created_at: readAt,
  });
}

// Hides exactly one occurrence from the dashboard PREVIEW only — the full
// Notification Center ignores dismissedAt entirely and keeps showing it.
// Closing card B on the dashboard never touches card A or C.
export function dismissLotNotification(
  userId: string,
  coffeeShopId: string,
  lotId: string,
  statusChangedAt: string,
  isAuthenticated: boolean
): void {
  const dismissedAt = new Date().toISOString();
  const next = upsertLocal(userId, coffeeShopId, lotId, statusChangedAt, { dismissedAt });
  if (!isAuthenticated) return;
  sendRow({
    user_id: userId,
    coffee_shop_id: coffeeShopId,
    lot_id: lotId,
    status_changed_at: statusChangedAt,
    read_at: next.readAt,
    dismissed_at: next.dismissedAt,
    created_at: dismissedAt,
  });
}

export async function syncLotNotificationReadsFromSupabase(
  userId: string,
  isAuthenticated: boolean
): Promise<void> {
  if (!isAuthenticated) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('lot_notification_reads').select('*').eq('user_id', userId);
    if (error || !data) return;
    const remote = (data as LotNotificationReadRow[]).map((row) => ({
      userId: row.user_id,
      coffeeShopId: row.coffee_shop_id,
      lotId: row.lot_id,
      statusChangedAt: row.status_changed_at,
      readAt: row.read_at,
      dismissedAt: row.dismissed_at,
    }));
    const others = read().filter((r) => r.userId !== userId);
    write([...others, ...remote]);
  } catch {
    // Offline / table not migrated yet — local cache stands.
  }
}

// Called on a real account switch on this device/browser — see
// lib/journey/userScope.ts.
export function purgeLotNotificationReadsForUser(userId: string): void {
  write(read().filter((r) => r.userId !== userId));
}
