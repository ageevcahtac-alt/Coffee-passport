'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './brewingRecipesStore';

export function useBrewingRecipes() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
