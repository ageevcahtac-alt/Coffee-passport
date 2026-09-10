// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §16) — the
// product's core philosophy statement earns its place once, at full length,
// the first time ANY guest completes a reveal, then recedes to a short
// always-present line so it never reads as a repeated lecture. This is a
// persistent (localStorage, not per-lot sessionStorage) flag — unlike
// revealFlag.ts's one-shot-per-lot unlock animation, "have you ever seen
// this" is a single, permanent, cross-lot fact about this browser.
const KEY = 'coffee-passport:seen-taste-philosophy';

export function hasSeenTastePhilosophy(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    // Storage unavailable — treat as "not seen yet" so the guest still gets
    // the moment at least once per session, worse case is seeing it twice
    // across sessions, never a functional break.
    return false;
  }
}

export function markSeenTastePhilosophy(): void {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable — the philosophy moment will just show again next
    // time; harmless.
  }
}
