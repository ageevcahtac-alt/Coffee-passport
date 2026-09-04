'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './customBrewMethodsStore';
import type { CustomBrewMethod } from '@/lib/types/coffee';

// Every custom method currently in the local cache (any owner) — callers
// filter by owner themselves (see getCustomBrewMethodsForOwner for the
// non-hook equivalent). Sync is the caller's responsibility
// (syncCustomBrewMethodsFromSupabase), same on-demand idiom as
// useEquipment/syncEquipmentFromSupabase.
export function useCustomBrewMethods(): CustomBrewMethod[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
