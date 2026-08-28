// One-shot signal that a guest's just-saved blind tasting activated a brand
// new country pin on the Coffee Belt map (see components/coffee/
// CoffeeBeltMap.tsx) — set by the taste flow, consumed by the journey page
// to auto-select and animate that pin. Same sessionStorage one-shot idiom
// as lib/journey/revealFlag.ts.
const KEY = 'coffee-passport:just-activated-country';

export function markCountryJustActivated(country: string): void {
  try {
    window.sessionStorage.setItem(KEY, country);
  } catch {
    // Storage unavailable — the map just won't auto-select/animate this
    // time; the pin itself still appears once records are read.
  }
}

export function consumeCountryJustActivated(): string | null {
  try {
    const country = window.sessionStorage.getItem(KEY);
    if (country) window.sessionStorage.removeItem(KEY);
    return country;
  } catch {
    return null;
  }
}
