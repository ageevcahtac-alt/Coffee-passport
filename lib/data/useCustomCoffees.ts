'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './customCoffeeStore';

export function useCustomCoffees() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
