// Carries the coffee shop a guest picked on the passport page's check-in
// gate (app/(site)/passport/[lotId]/page.tsx) across the navigation into
// the taste flow (app/(site)/passport/[lotId]/taste/page.tsx), so that
// flow's own shop step can be skipped instead of asking twice. Keyed by
// lotId so a stale flag from a different lot's visit can't leak in. Same
// sessionStorage one-shot idiom as revealFlag.ts / mapFlag.ts.
function key(lotId: string): string {
  return `coffee-passport:pending-shop:${lotId}`;
}

export function markPendingShop(lotId: string, coffeeShopId: string): void {
  try {
    window.sessionStorage.setItem(key(lotId), coffeeShopId);
  } catch {
    // Storage unavailable — the taste flow just falls back to asking for
    // the shop itself, same as if this had never been set.
  }
}

export function consumePendingShop(lotId: string): string | null {
  try {
    const shopId = window.sessionStorage.getItem(key(lotId));
    if (shopId) window.sessionStorage.removeItem(key(lotId));
    return shopId;
  } catch {
    return null;
  }
}
