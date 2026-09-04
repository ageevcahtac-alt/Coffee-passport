'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { subscribe, getMenuLotIds, getServerMenuLotIds, getMenuEntries, type CafeMenuEntry } from './cafeMenuStore';

// Guest-facing membership only — lots the coffee shop currently toggled ON.
export function useCafeMenuLotIds(shopId: string): string[] {
  const getSnapshot = useCallback(() => getMenuLotIds(shopId), [shopId]);
  const getServerSnapshot = useCallback(() => getServerMenuLotIds(shopId), [shopId]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Every lot on the shop's roster, active or toggled off — for the cafe's own
// dashboard (shows the toggle + status control) and add-lot.tsx (won't offer
// a re-add for a lot that's merely toggled off).
export function useCafeMenuEntries(shopId: string): Record<string, CafeMenuEntry> {
  const getSnapshot = useCallback(() => getMenuEntries(shopId), [shopId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// One lot's entry within a shop's menu, or null when it's not on the menu
// at all — a small convenience for callers (LotMenuCard, LotDetailModal)
// that only care about a single lot rather than the whole roster.
export function useCafeMenuStatus(shopId: string, lotId: string): CafeMenuEntry | null {
  const entries = useCafeMenuEntries(shopId);
  return entries[lotId] ?? null;
}
