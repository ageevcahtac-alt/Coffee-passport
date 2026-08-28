'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { subscribe, getMenuLotIds, getServerMenuLotIds } from './cafeMenuStore';

export function useCafeMenuLotIds(shopId: string): string[] {
  const getSnapshot = useCallback(() => getMenuLotIds(shopId), [shopId]);
  const getServerSnapshot = useCallback(() => getServerMenuLotIds(shopId), [shopId]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
