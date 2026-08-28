// One-shot signal that a guest's just-saved blind tasting activated a brand
// new pin on the Coffee Belt map (see components/coffee/CoffeeBeltMap.tsx)
// — set by the taste flow, consumed by the journey page to auto-select and
// animate that pin. A pin is keyed by (country, coffeeShopId): pins are
// colored and grouped by which COFFEE SHOP the check-in happened at (its
// brandColor), not by roaster, so "new" means this specific shop hasn't
// been checked into for this country before. Same sessionStorage one-shot
// idiom as lib/journey/revealFlag.ts.
const KEY = 'coffee-passport:just-activated-pin';

export interface ActivatedPinFlag {
  country: string;
  coffeeShopId: string;
}

export function markPinJustActivated(country: string, coffeeShopId: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ country, coffeeShopId }));
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
