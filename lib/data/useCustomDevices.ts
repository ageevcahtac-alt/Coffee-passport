'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './customDevicesStore';

export function useCustomDevices() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
