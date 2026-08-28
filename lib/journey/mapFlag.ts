// One-shot signal that a guest's just-saved blind tasting activated a brand
// new pin on the Coffee Belt map (see components/coffee/CoffeeBeltMap.tsx)
// — set by the taste flow, consumed by the journey page to auto-select and
// animate that pin. A pin is keyed by (country, roasterId): the same
// country can carry more than one roaster's pin, so "new" means this
// specific roaster hasn't been tasted from this country before, not just
// that the country itself is new. Same sessionStorage one-shot idiom as
// lib/journey/revealFlag.ts.
const KEY = 'coffee-passport:just-activated-pin';

export interface ActivatedPinFlag {
  country: string;
  roasterId: string;
}

export function markPinJustActivated(country: string, roasterId: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ country, roasterId }));
  } catch {
    // Storage unavailable — the map just won't auto-select/animate this
    // time; the pin itself still appears once records are read.
  }
}

export function consumePinJustActivated(): ActivatedPinFlag | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as ActivatedPinFlag;
  } catch {
    return null;
  }
}
