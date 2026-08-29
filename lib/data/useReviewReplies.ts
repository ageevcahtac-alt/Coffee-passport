'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './reviewRepliesStore';

export function useReviewReplies() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
