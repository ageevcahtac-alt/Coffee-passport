'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './grindConfirmationsStore';

export function useGrindConfirmations() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
