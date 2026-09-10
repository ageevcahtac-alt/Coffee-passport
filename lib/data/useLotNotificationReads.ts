'use client';

import { useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  type LotNotificationReadState,
} from './lotNotificationReadsStore';

export function useLotNotificationReads(): LotNotificationReadState[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
