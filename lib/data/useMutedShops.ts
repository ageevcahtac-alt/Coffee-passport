'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot, type ShopMutePreference } from './shopMutePreferencesStore';

export function useMutedShops(): ShopMutePreference[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
