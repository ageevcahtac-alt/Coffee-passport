'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './customCoffeeCuppingsStore';

export function useCustomCoffeeCuppings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
