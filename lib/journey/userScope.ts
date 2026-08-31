'use client';

import { purgeRecordsForUser } from '@/lib/journey/store';
import { purgeEnthusiastRecipesForUser } from '@/lib/data/brewingRecipesStore';
import { purgeEquipmentForUser } from '@/lib/data/equipmentStore';
import { purgeVotesForUser } from '@/lib/data/recipeVotesStore';

const ACTIVE_USER_KEY = 'coffee-passport:active-user';

// Guards against one real risk of this app's local-only persistence model:
// several people sharing one browser/PWA install (or one person signing
// out of one account and into another on the same device). Every personal
// store here (journey, brewing-recipes, equipment, recipe-votes) is one
// flat array shared by whoever is currently "logged in" locally — there's
// no per-account partition on disk, only a userId field per record. Run
// once, on every resolved-identity change (see lib/auth/CurrentUserProvider.tsx):
// if the active user changed, drop every record that belonged to the
// PREVIOUS user before the new account's session starts reading these
// stores, so their data can't bleed into someone else's view.
//
// Deliberately narrow: only ever removes entries the outgoing user
// authored/owns. Roaster and coffee-shop authored data (benchmark recipes,
// signature recipes, their own Garage setups) is shared catalog content,
// never touched here.
export function reconcileUserScope(newUserId: string): void {
  if (typeof window === 'undefined') return;

  let previousUserId: string | null = null;
  try {
    previousUserId = window.localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return;
  }

  if (previousUserId && previousUserId !== newUserId) {
    purgeRecordsForUser(previousUserId);
    purgeEnthusiastRecipesForUser(previousUserId);
    purgeEquipmentForUser(previousUserId);
    purgeVotesForUser(previousUserId);
  }

  try {
    window.localStorage.setItem(ACTIVE_USER_KEY, newUserId);
  } catch {
    // Storage unavailable — nothing to reconcile against next time either,
    // so this is a no-op rather than a half-applied purge.
  }
}
