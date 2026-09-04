'use client';

import type { ShopMutePreferenceRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// A guest's own opt-out of one shop's "Обновления на баре" announcements
// (components/coffee/BarUpdatesPanel.tsx) — "Отписаться от обновлений
// этой кофейни" on the shop page (app/(site)/shop/[shopId]/page.tsx).
// Presence of a record means muted, absence means subscribed (the
// default). Same local-cache-first pattern as every other store here:
// instant for everyone (including anonymous browsing, so the toggle works
// immediately even before an account exists), synced to Supabase's
// public.shop_mute_preferences only once actually authenticated — an
// anonymous device id isn't a valid uuid and has no auth.uid() session to
// write under, so a sync attempt for one would just fail the RLS check
// every time; skipping it entirely (rather than attempting and eating the
// error) avoids a pointless network round trip on every mute/unmute.

export interface ShopMutePreference {
  userId: string;
  shopId: string;
  createdAt: string;
}

const STORAGE_KEY = 'coffee-passport:muted-shops';

let cache: ShopMutePreference[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: ShopMutePreference[] = [];

function read(): ShopMutePreference[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as ShopMutePreference[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(records: ShopMutePreference[]) {
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

export function getSnapshot(): ShopMutePreference[] {
  return read();
}

export function getServerSnapshot(): ShopMutePreference[] {
  return EMPTY;
}

export function isShopMuted(userId: string, shopId: string): boolean {
  return read().some((record) => record.userId === userId && record.shopId === shopId);
}

export function muteShop(userId: string, shopId: string, isAuthenticated: boolean): void {
  if (isShopMuted(userId, shopId)) return;
  write([...read(), { userId, shopId, createdAt: new Date().toISOString() }]);

  if (!isAuthenticated) return;
  void getBrowserSupabaseClient()
    .from('shop_mute_preferences')
    .insert({ guest_id: userId, shop_id: shopId, created_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) {
        console.warn('[shop_mute_preferences] Supabase write failed, kept local-only:', error.message);
      }
    });
}

export function unmuteShop(userId: string, shopId: string, isAuthenticated: boolean): void {
  write(read().filter((record) => !(record.userId === userId && record.shopId === shopId)));

  if (!isAuthenticated) return;
  void getBrowserSupabaseClient()
    .from('shop_mute_preferences')
    .delete()
    .eq('guest_id', userId)
    .eq('shop_id', shopId)
    .then(({ error }) => {
      if (error) {
        console.warn('[shop_mute_preferences] Supabase delete failed, kept local-only:', error.message);
      }
    });
}

// Bootstrapped alongside the other per-account syncs in
// lib/auth/currentUser.tsx — a no-op for anonymous visitors (same
// isAuthenticated gate as syncRecipesFromSupabase).
export async function syncMutedShopsFromSupabase(userId: string, isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('shop_mute_preferences').select('*').eq('guest_id', userId);
    if (error || !data) return;
    const remote = (data as ShopMutePreferenceRow[]).map((row) => ({
      userId: row.guest_id,
      shopId: row.shop_id,
      createdAt: row.created_at,
    }));
    const others = read().filter((record) => record.userId !== userId);
    write([...others, ...remote]);
  } catch {
    // Offline / table not migrated yet — local cache stands.
  }
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's own mute list.
export function purgeMutedShopsForUser(userId: string): void {
  write(read().filter((record) => record.userId !== userId));
}
