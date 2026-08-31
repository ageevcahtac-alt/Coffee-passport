// Carries the roaster a guest confirmed/corrected on the passport page's
// location gate (app/(site)/passport/[lotId]/page.tsx) across the
// navigation into the taste flow (app/(site)/passport/[lotId]/taste/page.tsx),
// so that flow's own location step can be skipped instead of asking twice.
// Keyed by lotId so a stale flag from a different lot's visit can't leak in.
// Same sessionStorage one-shot idiom as pendingShopFlag.ts / revealFlag.ts /
// mapFlag.ts.
function key(lotId: string): string {
  return `coffee-passport:pending-roaster:${lotId}`;
}

export function markPendingRoaster(lotId: string, roasterId: string): void {
  try {
    window.sessionStorage.setItem(key(lotId), roasterId);
  } catch {
    // Storage unavailable — the taste flow just falls back to the lot's own
    // roasterId, same as if this had never been set.
  }
}

export function consumePendingRoaster(lotId: string): string | null {
  try {
    const roasterId = window.sessionStorage.getItem(key(lotId));
    if (roasterId) window.sessionStorage.removeItem(key(lotId));
    return roasterId;
  } catch {
    return null;
  }
}
