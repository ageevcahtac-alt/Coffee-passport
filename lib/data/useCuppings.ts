'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './cuppingsStore';

export function useCuppings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
