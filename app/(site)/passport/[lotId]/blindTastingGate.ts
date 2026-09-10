import type { TastingRecord } from '@/lib/types/coffee';

// Blind-tasting spoiler-protection gate — extracted out of page.tsx (a
// Next.js page file, which may only export a fixed set of names like
// `default`/`metadata`) so it's both importable from page.tsx and directly
// testable (see blindTastingGate.test.ts —
// COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md: this rule had no test
// coverage anywhere). True only once a tasting this exact guest already
// saved, at this exact shop, for this exact lot, exists in their journey —
// the one condition under which community tastings/roaster comparison
// content may be fetched or rendered at all.
export function hasRevealedTasting(
  journey: TastingRecord[],
  lotId: string | undefined,
  shopId: string | null,
  userId: string
): boolean {
  if (!lotId || !shopId) return false;
  return journey.some((record) => record.lotId === lotId && record.coffeeShopId === shopId && record.userId === userId);
}
