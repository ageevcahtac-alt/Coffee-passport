'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './cafeStaffStore';

export function useCafeStaff() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
