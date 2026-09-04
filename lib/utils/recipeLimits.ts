import { RECIPE_LIMITS, type BrewingRecipe, type RecipeAuthorType } from '@/lib/types/coffee';

// Client-side mirrors of the rules enforced by trg_enforce_recipe_quotas /
// trg_enforce_custom_method_limit (see supabase/migrations/0016_recipe_quota_limits.sql).
// These exist purely for responsive UX (disable a button, show "3/5"
// before a network round trip) — the DB trigger is the actual backstop
// that can't be bypassed by writing straight to Supabase's REST API.

export function getDraftCount(
  recipes: BrewingRecipe[],
  authorType: RecipeAuthorType,
  authorId: string,
  brewingMethodId: string
): number {
  return recipes.filter(
    (recipe) =>
      recipe.authorType === authorType &&
      recipe.authorId === authorId &&
      recipe.brewingMethodId === brewingMethodId &&
      !recipe.isPublic
  ).length;
}

export function canCreateDraft(
  recipes: BrewingRecipe[],
  authorType: RecipeAuthorType,
  authorId: string,
  brewingMethodId: string
): boolean {
  return getDraftCount(recipes, authorType, authorId, brewingMethodId) < RECIPE_LIMITS.maxDraftsPerMethod;
}

// A minimal shape covering both a full RecipePublishEventRow read from
// Supabase and the one field this module actually needs.
export interface PublishEventLike {
  brewingMethodId: string;
  publishedAt: string; // ISO timestamp
}

// null = never published for this method, so publishing now is allowed.
export function getNextPublishEligibleAt(
  publishEvents: PublishEventLike[],
  brewingMethodId: string
): Date | null {
  const relevant = publishEvents.filter((event) => event.brewingMethodId === brewingMethodId);
  if (relevant.length === 0) return null;
  const lastPublishedAt = relevant.reduce(
    (latest, event) => Math.max(latest, new Date(event.publishedAt).getTime()),
    0
  );
  const eligibleAt = new Date(lastPublishedAt + RECIPE_LIMITS.publicIntervalDays * 24 * 60 * 60 * 1000);
  return eligibleAt.getTime() > Date.now() ? eligibleAt : null;
}

export function canPublishNow(publishEvents: PublishEventLike[], brewingMethodId: string): boolean {
  return getNextPublishEligibleAt(publishEvents, brewingMethodId) === null;
}

export function canCreateCustomMethod(existingCount: number): boolean {
  return existingCount < RECIPE_LIMITS.maxCustomMethods;
}
