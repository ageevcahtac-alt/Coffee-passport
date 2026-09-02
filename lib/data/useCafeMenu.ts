'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { subscribe, getMenuLotIds, getServerMenuLotIds, getMenuEntries } from './cafeMenuStore';

// Guest-facing membership only — lots the coffee shop currently toggled ON.
export function useCafeMenuLotIds(shopId: string): string[] {
  const getSnapshot = useCallback(() => getMenuLotIds(shopId), [shopId]);
  const getServerSnapshot = useCallback(() => getServerMenuLotIds(shopId), [shopId]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Every lot on the shop's roster, active or toggled off — for the cafe's own
// dashboard (shows the toggle) and add-lot.tsx (won't offer a re-add for a
// lot that's merely toggled off).
export function useCafeMenuEntries(shopId: string): Record<string, boolean> {
  const getSnapshot = useCallback(() => getMenuEntries(shopId), [shopId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
