'use client';

import { useSyncExternalStore } from 'react';
import { subscribeRoasters, getRoastersSnapshot, getRoastersServerSnapshot } from './roasters';

export function useRoasters() {
  return useSyncExternalStore(subscribeRoasters, getRoastersSnapshot, getRoastersServerSnapshot);
}
