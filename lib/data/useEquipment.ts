'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './equipmentStore';

export function useEquipment() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
