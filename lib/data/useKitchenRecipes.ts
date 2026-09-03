'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './kitchenRecipesStore';

export function useKitchenRecipes() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
