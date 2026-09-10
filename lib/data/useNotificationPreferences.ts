'use client';

import { useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  type NotificationPreference,
} from './notificationPreferencesStore';

export function useNotificationPreferences(): NotificationPreference[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
