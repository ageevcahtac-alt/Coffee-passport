'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot } from './recipeVotesStore';

export function useRecipeVotes() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
