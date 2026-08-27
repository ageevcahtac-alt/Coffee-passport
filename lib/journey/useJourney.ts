'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './store';

export function useJourney() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
