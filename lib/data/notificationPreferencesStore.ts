'use client';

import type { NotificationPreferenceRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// A guest's own global on/off switch for NEW_CAFE_LOT notifications
// ("Уведомлять о новых лотах в кофейнях" — see
// components/shared/NotificationCenter.tsx). Same local-cache-first,
// sync-only-when-authenticated pattern as shopMutePreferencesStore.ts:
// absence of a row means enabled (the default), presence with
// notifyNewLots=false means the guest turned it off. An anonymous device
// id has no auth.uid() session to write under, so its preference stays
// local-only until sign-in, same reasoning as every other store here.

export interface NotificationPreference {
  userId: string;
  notifyNewLots: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'coffee-passport:notification-preferences';

let cache: NotificationPreference[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: NotificationPreference[] = [];

function read(): NotificationPreference[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as NotificationPreference[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(records: NotificationPreference[]) {
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

export function getSnapshot(): NotificationPreference[] {
  return read();
}

export function getServerSnapshot(): NotificationPreference[] {
  return EMPTY;
}

// Default (no record yet) is enabled — same "absence means the default"
// idiom as isShopMuted.
export function isNewLotNotificationsEnabled(userId: string): boolean {
  const record = read().find((r) => r.userId === userId);
  return record ? record.notifyNewLots : true;
}

export function setNewLotNotificationsEnabled(
  userId: string,
  enabled: boolean,
  isAuthenticated: boolean
): void {
  const updatedAt = new Date().toISOString();
  const others = read().filter((r) => r.userId !== userId);
  write([...others, { userId, notifyNewLots: enabled, updatedAt }]);

  if (!isAuthenticated) return;
  void getBrowserSupabaseClient()
    .from('notification_preferences')
    .upsert(
      { user_id: userId, notify_new_lots: enabled, updated_at: updatedAt },
      { onConflict: 'user_id' }
    )
    .then(({ error }) => {
      if (error) {
        console.warn('[notification_preferences] Supabase write failed, kept local-only:', error.message);
      }
    });
}

export async function syncNotificationPreferencesFromSupabase(
  userId: string,
  isAuthenticated: boolean
): Promise<void> {
  if (!isAuthenticated) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as NotificationPreferenceRow;
    const others = read().filter((r) => r.userId !== userId);
    write([...others, { userId: row.user_id, notifyNewLots: row.notify_new_lots, updatedAt: row.updated_at }]);
  } catch {
    // Offline / table not migrated yet — local cache stands.
  }
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's own preference so
// it can't bleed into the next account's view of this shared browser.
export function purgeNotificationPreferenceForUser(userId: string): void {
  write(read().filter((r) => r.userId !== userId));
}

// Mirrors shopMutePreferencesStore's claimMutedShopsForUser — an
// anonymous guest who already turned notifications off on this device
// keeps that choice once they sign in, instead of silently reverting to
// the default the moment isNewLotNotificationsEnabled starts being called
// with the real authenticated userId. Only claims when the real account
// has no explicit preference of its own yet (a real, already-set
// preference always wins over an anonymous one).
export async function claimNotificationPreferenceForUser(
  anonUserId: string,
  realUserId: string
): Promise<void> {
  const existing = read();
  const anonRecord = existing.find((r) => r.userId === anonUserId);
  if (!anonRecord) return;
  if (existing.some((r) => r.userId === realUserId)) return;

  const claimed: NotificationPreference = { ...anonRecord, userId: realUserId };
  write([...existing.filter((r) => r.userId !== anonUserId), claimed]);

  try {
    const { error } = await getBrowserSupabaseClient()
      .from('notification_preferences')
      .upsert(
        { user_id: realUserId, notify_new_lots: claimed.notifyNewLots, updated_at: claimed.updatedAt },
        { onConflict: 'user_id' }
      );
    if (error) {
      console.warn('[notification_preferences] Failed to sync claimed anonymous preference, kept local-only:', error.message);
    }
  } catch (err) {
    console.warn('[notification_preferences] Claiming anonymous preference threw, kept local-only:', err);
  }
}
