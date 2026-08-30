'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './roastProfilesStore';

export function useRoastProfiles() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
