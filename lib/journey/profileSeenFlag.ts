// Remembers that this device opened a lot's full profile from the store
// path ("Я в магазине — узнать о лоте", app/(site)/passport/[lotId]/page.tsx)
// before any cupping, so the taste flow can stamp the tasting
// profile_seen_before_tasting (supabase/migrations/0034_*). localStorage,
// not sessionStorage like pendingShopFlag.ts: the guest may come back to cup
// the lot days later, and once seen the profile stays seen. Keyed by lotId
// only, so it survives the anonymous → signed-in switch on the same device.
function key(lotId: string): string {
  return `coffee-passport:profile-seen:${lotId}`;
}

export function markLotProfileSeen(lotId: string): void {
  try {
    window.localStorage.setItem(key(lotId), '1');
  } catch {
    // Storage unavailable — the tasting is saved unflagged, same as a blind one.
  }
}

export function hasSeenLotProfile(lotId: string): boolean {
  try {
    return window.localStorage.getItem(key(lotId)) === '1';
  } catch {
    return false;
  }
}
