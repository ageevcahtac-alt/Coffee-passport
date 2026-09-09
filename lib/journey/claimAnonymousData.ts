'use client';

import { claimAnonymousTastings } from '@/lib/journey/store';
import { claimEnthusiastRecipesForUser } from '@/lib/data/brewingRecipesStore';
import { claimEquipmentForUser } from '@/lib/data/equipmentStore';
import { claimKitchenRecipesForUser } from '@/lib/data/kitchenRecipesStore';
import { claimCustomCoffeeForUser } from '@/lib/data/customCoffeeStore';
import { claimCustomCoffeeCuppingsForUser } from '@/lib/data/customCoffeeCuppingsStore';
import { claimVotesForUser } from '@/lib/data/recipeVotesStore';
import { claimMutedShopsForUser } from '@/lib/data/shopMutePreferencesStore';

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — the full
// application E2E audit found claimAnonymousTastings (lib/journey/store.ts)
// was the only claim mechanism in the codebase: tastings survived a guest's
// signup, but seven sibling personal, userId-scoped local stores
// (lib/journey/userScope.ts's own purge list, minus tastings) did not —
// their anonymous-created content was never deleted, just permanently
// re-invisible under the new real account. This orchestrator is the single
// call site lib/auth/currentUser.tsx now uses in place of calling
// claimAnonymousTastings alone, so every store that needs claiming gets it
// from the same one moment (right after a guest authenticates for the
// first time on this device) without currentUser.tsx needing to know each
// store's own internal shape.
//
// Each store owns its own claim function (same reasoning userScope.ts's
// per-store purge functions already follow — only the store itself can
// safely reach into its own private cache/localStorage key), and each is
// independently idempotent, non-destructive, and duplicate-safe on its own
// terms (see each function's own comment for its store's specific
// ownership/conflict rules — e.g. equipment's singleton-per-user shape
// skips a claim entirely rather than overwrite already-owned authenticated
// data, and votes/muted-shops drop an anonymous duplicate rather than
// create a second row for an already-voted/-muted pair).
//
// Promise.allSettled — not Promise.all — is the actual safety mechanism
// for section 6 (partial failure): every claim function below is declared
// `async`, so calling it always returns a promise immediately even if it
// throws synchronously inside, which means one store's failure can never
// prevent the array literal itself from reaching (and therefore invoking)
// every other store's own claim call. A rejected settlement here is only
// ever the Supabase half of a claim (each store already re-tags its local
// cache — the durable, always-available part — before attempting any
// network call), so a rejection here means "this device's own view is
// already correct; it just hasn't reached another device yet," never data
// loss.
export async function claimAnonymousUserData(anonUserId: string, realUserId: string): Promise<void> {
  await Promise.allSettled([
    claimAnonymousTastings(anonUserId, realUserId),
    claimEnthusiastRecipesForUser(anonUserId, realUserId),
    claimEquipmentForUser(anonUserId, realUserId),
    claimKitchenRecipesForUser(anonUserId, realUserId),
    claimCustomCoffeeForUser(anonUserId, realUserId),
    claimCustomCoffeeCuppingsForUser(anonUserId, realUserId),
    claimVotesForUser(anonUserId, realUserId),
    claimMutedShopsForUser(anonUserId, realUserId),
  ]);
}
