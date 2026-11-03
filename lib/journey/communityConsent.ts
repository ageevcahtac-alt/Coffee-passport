// Community Layer (docs/reports/COMMUNITY_LAYER_PRODUCT_AUDIT.md) — sharing a
// blind tasting with other guests is explicit opt-in only, the same "never
// automatic" rule BrewingRecipe.isPublic already follows: default off, the
// guest flips the checkbox themselves at save time, nothing already saved
// becomes public retroactively.
//
// The isAuthenticated half of the AND is load-bearing, not decorative: an
// anonymous checkin never reaches Supabase at all (checkins.owner_user_id
// references auth.users(id), so lib/journey/store.ts keeps it local-only),
// which means a consent flag on an anonymous tasting could never take
// effect anywhere — offering that checkbox would be a false promise. The
// taste form therefore renders the control only to signed-in guests and
// routes both flags through this one function so the invariant is pinned
// in exactly one tested place.

export function sharedTastingIsPublic(isAuthenticated: boolean, consentGiven: boolean): boolean {
  return isAuthenticated && consentGiven;
}
