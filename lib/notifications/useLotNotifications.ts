'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useJourney } from '@/lib/journey/useJourney';
import { useLots } from '@/lib/data/useLots';
import { useMutedShops } from '@/lib/data/useMutedShops';
import { useNotificationPreferences } from '@/lib/data/useNotificationPreferences';
import { useLotNotificationReads } from '@/lib/data/useLotNotificationReads';
import {
  subscribe as subscribeCafeMenu,
  getVersion as getCafeMenuVersion,
  getMenuEntries,
  getMenuLotIds,
  syncCafeMenuFromSupabaseForShops,
  ensureCafeMenuRealtimeSubscribed,
} from '@/lib/data/cafeMenuStore';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getShopAnnouncements } from '@/lib/utils/shopAnnouncements';
import {
  notificationKey,
  markLotNotificationRead,
  dismissLotNotification,
  type LotNotificationReadState,
} from '@/lib/data/lotNotificationReadsStore';
import { ROAST_TYPE_LABELS, type Lot, type LotMenuStatus } from '@/lib/types/coffee';

// Unified Notification / Event Center — the NEW_CAFE_LOT half. See
// components/shared/NotificationCenter.tsx and components/coffee/
// BarUpdatesPanel.tsx, both of which consume this same set of hooks so the
// dashboard preview and the full center can never disagree about what
// exists, what's read, or what's been dismissed.

export interface LotAnnouncementItem {
  key: string; // notificationKey(shopId, lotId, statusChangedAt) — one distinct occurrence
  shopId: string;
  shopName: string;
  lot: Lot;
  status: Extract<LotMenuStatus, 'new' | 'discontinuing'>;
  statusChangedAt: string;
}

export interface LotNotificationItem extends LotAnnouncementItem {
  read: boolean;
  dismissed: boolean;
}

// Every shop this signed-in guest has actually checked into, own records
// only — same source/filter journey/page.tsx already uses for its own
// "Обновления на баре" + map-pins computation, pulled out here so the
// bell (mounted globally in Navbar) can compute the identical set without
// duplicating the filter logic.
export function useVisitedShopIds(): string[] {
  const { userId } = useCurrentUser();
  const journey = useJourney();
  return useMemo(() => {
    const ids = new Set<string>();
    for (const record of journey) {
      if (record.userId === userId) ids.add(record.coffeeShopId);
    }
    return Array.from(ids);
  }, [journey, userId]);
}

function useCafeMenuVersion(): number {
  return useSyncExternalStore(subscribeCafeMenu, getCafeMenuVersion, getCafeMenuVersion);
}

function useMutedShopIdSet(): Set<string> {
  const { userId } = useCurrentUser();
  const muted = useMutedShops();
  return useMemo(
    () => new Set(muted.filter((record) => record.userId === userId).map((record) => record.shopId)),
    [muted, userId]
  );
}

// The derived, always-current list of NEW_CAFE_LOT announcements across
// every one of the guest's visited, non-muted shops — status IS the
// announcement (see lib/utils/shopAnnouncements.ts), so this never
// duplicates cafe_menu_entries' own content, only combines it across
// shops and keeps it live (batched sync + one shared realtime channel).
export function useLotAnnouncements(visitedShopIds: string[]): LotAnnouncementItem[] {
  const lots = useLots();
  const mutedShopIds = useMutedShopIdSet();
  const version = useCafeMenuVersion();

  const relevantShopIds = useMemo(
    () => visitedShopIds.filter((shopId) => !mutedShopIds.has(shopId)),
    [visitedShopIds, mutedShopIds]
  );
  const shopIdsKey = useMemo(() => relevantShopIds.slice().sort().join(','), [relevantShopIds]);

  useEffect(() => {
    ensureCafeMenuRealtimeSubscribed();
  }, []);

  useEffect(() => {
    if (relevantShopIds.length === 0) return;
    void syncCafeMenuFromSupabaseForShops(relevantShopIds);
    // shopIdsKey is the real dependency (a stable string) — relevantShopIds
    // itself is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIdsKey]);

  return useMemo(() => {
    const items: LotAnnouncementItem[] = [];
    for (const shopId of relevantShopIds) {
      const shop = getCoffeeShopById(shopId);
      if (!shop) continue;
      const entries = getMenuEntries(shopId);
      const menuLotIds = getMenuLotIds(shopId);
      const menuLots = lots.filter((lot) => menuLotIds.includes(lot.id));
      const announcements = getShopAnnouncements(menuLots, entries);
      for (const announcement of announcements) {
        const statusChangedAt = entries[announcement.lot.id]?.statusChangedAt ?? new Date(0).toISOString();
        items.push({
          key: notificationKey(shopId, announcement.lot.id, statusChangedAt),
          shopId,
          shopName: shop.name,
          lot: announcement.lot,
          status: announcement.status,
          statusChangedAt,
        });
      }
    }
    items.sort((a, b) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime());
    return items;
    // version/shopIdsKey drive re-computation on any underlying data change;
    // relevantShopIds/lots are read inside but re-derive together with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIdsKey, lots, version]);
}

// Combines the derived announcement list with this guest's own persisted
// read/dismiss state, and honors the global "Уведомлять о новых лотах"
// preference — disabled means this returns an empty list outright, not
// just a hidden preview (the full center must also stay empty).
export function useLotNotifications(visitedShopIds: string[]): LotNotificationItem[] {
  const { userId } = useCurrentUser();
  const announcements = useLotAnnouncements(visitedShopIds);
  const readRecords = useLotNotificationReads();
  const preferences = useNotificationPreferences();

  const enabled = useMemo(() => {
    const pref = preferences.find((record) => record.userId === userId);
    return pref ? pref.notifyNewLots : true;
  }, [preferences, userId]);

  return useMemo(
    () => mergeLotNotifications(announcements, readRecords, userId, enabled),
    [announcements, readRecords, userId, enabled]
  );
}

// Pure merge step, pulled out of the hook above so it's directly
// unit-testable without a React render environment (this project has no
// jsdom/component-render infra — same "extract the pure logic" idiom
// components/coffee/TasteHistoryPreview.tsx's summarizeTasteHistory
// already established). Disabled means "behave as if nothing exists", not
// just "hide the preview" — the full center must stay empty too.
export function mergeLotNotifications(
  announcements: LotAnnouncementItem[],
  readRecords: LotNotificationReadState[],
  userId: string | null,
  enabled: boolean
): LotNotificationItem[] {
  if (!enabled) return [];
  const own = readRecords.filter((record) => record.userId === userId);
  const readSet = new Set(
    own
      .filter((record) => record.readAt)
      .map((record) => notificationKey(record.coffeeShopId, record.lotId, record.statusChangedAt))
  );
  const dismissedSet = new Set(
    own
      .filter((record) => record.dismissedAt)
      .map((record) => notificationKey(record.coffeeShopId, record.lotId, record.statusChangedAt))
  );
  return announcements.map((item) => ({
    ...item,
    read: readSet.has(item.key),
    dismissed: dismissedSet.has(item.key),
  }));
}

// Unread count is always derived from the FULL list, never a preview
// slice — a dashboard showing only 3 cards must not report "3 unread"
// when there are actually 40.
export function useUnreadLotNotificationCount(visitedShopIds: string[]): number {
  const items = useLotNotifications(visitedShopIds);
  return useMemo(() => items.filter((item) => !item.read).length, [items]);
}

// Shared text/link builders — the one place BarUpdatesPanel and
// NotificationCenter both read from, so a preview card and its full-center
// row never drift into two different phrasings for the same occurrence.
export function describeLotNotification(item: LotAnnouncementItem): string {
  const roastLabel = ROAST_TYPE_LABELS[item.lot.roastType];
  const place = item.lot.region || item.lot.name;
  return item.status === 'new'
    ? `${item.shopName} добавила новый лот: ${item.lot.country} ${place} (${roastLabel})`
    : `${item.shopName} скоро выводит лот ${item.lot.country} ${place}. Успейте попробовать!`;
}

export function lotNotificationHref(item: LotAnnouncementItem): string {
  return `/shop/${item.shopId}?country=${encodeURIComponent(item.lot.country)}&roastType=${item.lot.roastType}`;
}

export function useLotNotificationActions() {
  const { userId, isAuthenticated } = useCurrentUser();
  return useMemo(
    () => ({
      markRead(item: Pick<LotAnnouncementItem, 'shopId' | 'lot' | 'statusChangedAt'>) {
        if (!userId) return;
        markLotNotificationRead(userId, item.shopId, item.lot.id, item.statusChangedAt, isAuthenticated);
      },
      dismiss(item: Pick<LotAnnouncementItem, 'shopId' | 'lot' | 'statusChangedAt'>) {
        if (!userId) return;
        dismissLotNotification(userId, item.shopId, item.lot.id, item.statusChangedAt, isAuthenticated);
      },
      markAllRead(items: Array<Pick<LotAnnouncementItem, 'shopId' | 'lot' | 'statusChangedAt'>>) {
        if (!userId) return;
        for (const item of items) {
          markLotNotificationRead(userId, item.shopId, item.lot.id, item.statusChangedAt, isAuthenticated);
        }
      },
    }),
    [userId, isAuthenticated]
  );
}
