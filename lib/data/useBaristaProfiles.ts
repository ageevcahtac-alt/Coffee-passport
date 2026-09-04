'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './baristaProfileStore';

// Merged Barista roster (static seed + Supabase-synced favoriteOrigin/
// favoriteBrewMethod/avatarUrl overrides). Sync itself is kicked off once,
// app-wide, by CurrentUserProvider — this hook only ever reads the cache.
export function useBaristaProfiles() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
