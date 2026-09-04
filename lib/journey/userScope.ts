'use client';

import { purgeRecordsForUser } from '@/lib/journey/store';
import { purgeEnthusiastRecipesForUser } from '@/lib/data/brewingRecipesStore';
import { purgeEquipmentForUser } from '@/lib/data/equipmentStore';
import { purgeVotesForUser } from '@/lib/data/recipeVotesStore';
import { purgeKitchenRecipesForUser } from '@/lib/data/kitchenRecipesStore';
import { purgeCustomCoffeeForUser } from '@/lib/data/customCoffeeStore';
import { purgeCustomCoffeeCuppingsForUser } from '@/lib/data/customCoffeeCuppingsStore';
import { purgeMutedShopsForUser } from '@/lib/data/shopMutePreferencesStore';

const ACTIVE_USER_KEY = 'coffee-passport:active-user';

// Guards against one real risk of this app's local-only persistence model:
// several people sharing one browser/PWA install (or one person signing
// out of one account and into another on the same device). Every personal
// store here (journey, brewing-recipes, equipment, recipe-votes) is one
// flat array shared by whoever is currently "logged in" locally — there's
// no per-account partition on disk, only a userId field per record. Run
// once, on every resolved-identity change (see lib/auth/CurrentUserProvider.tsx):
// if the active REAL account changed, drop every record that belonged to
// the PREVIOUS real account before the new one's session starts reading
// these stores, so their data can't bleed into someone else's view.
//
// Deliberately narrow: only ever removes entries the outgoing user
// authored/owns. Roaster and coffee-shop authored data (benchmark recipes,
// signature recipes, their own Garage setups) is shared catalog content,
// never touched here.
//
// isAuthenticated gates the WHOLE function, not just which id gets tracked:
// signing out (going anonymous) is treated as no signal at all here, not a
// change to react to. Every reader already filters its store by userId, so
// an anonymous visitor can't see a signed-out account's records regardless
// of whether this ran — the purge was pure defense in depth. Running it on
// logout, though, wiped the account's local cache immediately, and if the
// next login's Supabase resync (see syncCheckinsForUser) was ever slow,
// offline, or failed, the guest's own journal looked reset to whatever
// they'd added fresh in the new session — reported as "past check-ins
// disappear when I sign back into my own account". Skipping anonymous
// transitions entirely means ACTIVE_USER_KEY always tracks the last real
// account: signing back into the SAME one is a no-op here (nothing to
// purge, local cache never touched), and only signing into a genuinely
// DIFFERENT real account still triggers the purge.
export function reconcileUserScope(newUserId: string, isAuthenticated: boolean): void {
  if (typeof window === 'undefined' || !isAuthenticated) return;

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
    purgeKitchenRecipesForUser(previousUserId);
    purgeCustomCoffeeForUser(previousUserId);
    purgeCustomCoffeeCuppingsForUser(previousUserId);
    purgeMutedShopsForUser(previousUserId);
  }

  try {
    window.localStorage.setItem(ACTIVE_USER_KEY, newUserId);
  } catch {
    // Storage unavailable — nothing to reconcile against next time either,
    // so this is a no-op rather than a half-applied purge.
  }
}
