'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './lotsStore';

export function useLots() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
