// Carries the adapt-source recipe's grinder across the navigation from a
// recipe card (components/coffee/RecipeCard.tsx, "Сварил по этому рецепту")
// into the blind-taste flow (app/(site)/passport/[lotId]/taste/page.tsx), so
// the tasting form can ask "on which grinder did YOU brew?" and the save
// path can log a grind-conversion confirmation (lib/journey/store.ts).
// Keyed by lotId so a stale flag from another lot's visit can't leak in —
// same sessionStorage one-shot idiom as pendingShopFlag.ts / revealFlag.ts.
export interface PendingGrindSource {
  grinderModel: string;
  grinderSetting: string;
}

function key(lotId: string): string {
  return `coffee-passport:pending-grind-source:${lotId}`;
}

export function markPendingGrindSource(lotId: string, source: PendingGrindSource): void {
  try {
    window.sessionStorage.setItem(key(lotId), JSON.stringify(source));
  } catch {
    // Storage unavailable — the taste flow simply renders without the
    // "Ваш помол" section, same as if this had never been set.
  }
}

export function consumePendingGrindSource(lotId: string): PendingGrindSource | null {
  try {
    const raw = window.sessionStorage.getItem(key(lotId));
    if (!raw) return null;
    window.sessionStorage.removeItem(key(lotId));
    const parsed = JSON.parse(raw) as Partial<PendingGrindSource> | null;
    if (typeof parsed?.grinderModel !== 'string' || typeof parsed?.grinderSetting !== 'string') return null;
    return { grinderModel: parsed.grinderModel, grinderSetting: parsed.grinderSetting };
  } catch {
    return null;
  }
}
