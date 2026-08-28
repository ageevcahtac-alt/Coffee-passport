// A one-shot signal that a guest just finished a blind tasting for a given
// lot, so the passport page (app/(site)/passport/[lotId]/page.tsx) knows to
// play the unlock animation instead of just rendering the already-unlocked
// state. sessionStorage (not a query param) keeps this out of the URL and
// avoids any useSearchParams/Suspense concerns on a route that's otherwise
// plain client state.
function key(lotId: string): string {
  return `coffee-passport:just-revealed:${lotId}`;
}

export function markJustRevealed(lotId: string): void {
  try {
    window.sessionStorage.setItem(key(lotId), '1');
  } catch {
    // Storage unavailable — the passport page just won't play the unlock
    // animation this time; the unlocked content itself is unaffected.
  }
}

// Read-once: clears the flag as it reads it, so navigating back to this
// passport page later doesn't replay the animation.
export function consumeJustRevealed(lotId: string): boolean {
  try {
    const flagged = window.sessionStorage.getItem(key(lotId)) === '1';
    if (flagged) window.sessionStorage.removeItem(key(lotId));
    return flagged;
  } catch {
    return false;
  }
}
