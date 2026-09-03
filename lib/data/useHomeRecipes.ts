'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './homeRecipesStore';

export function useHomeRecipes() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
