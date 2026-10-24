import type { TastingRecord } from '@/lib/types/coffee';

// Lots a guest opened from the store path ("Я в магазине — узнать о лоте",
// app/(site)/passport/[lotId]/page.tsx) — the cupping is deferred, so the
// journey keeps them as "Не попробован" with a button back into the blind
// path until this user saves a tasting of the lot (see UntastedShopLots).
// localStorage, same as profileSeenFlag.ts: the guest may come back days
// later. Scoped by user id like the journey itself, so a second account on
// the same browser doesn't inherit the first one's list.
const KEY = 'coffee-passport:shop-lots';

interface ShopLot {
  userId: string;
  lotId: string;
}

function read(): ShopLot[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveShopLot(userId: string, lotId: string): void {
  if (!userId) return;
  try {
    const rest = read().filter((entry) => !(entry.userId === userId && entry.lotId === lotId));
    window.localStorage.setItem(KEY, JSON.stringify([{ userId, lotId }, ...rest]));
  } catch {
    // Storage unavailable — the lot just doesn't show up in the journey.
  }
}

// Sign-in on this device (lib/journey/claimAnonymousData.ts): the guest's
// anonymous store lots move to the account, an already-saved lot stays once.
export function claimShopLotsForUser(anonUserId: string, realUserId: string): void {
  if (!anonUserId || !realUserId || anonUserId === realUserId) return;
  try {
    const entries = read();
    const owned = new Set(entries.filter((entry) => entry.userId === realUserId).map((entry) => entry.lotId));
    const next = entries.flatMap((entry) => {
      if (entry.userId !== anonUserId) return [entry];
      if (owned.has(entry.lotId)) return [];
      owned.add(entry.lotId);
      return [{ ...entry, userId: realUserId }];
    });
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — nothing to move.
  }
}

// Newest first.
export function getShopLotIds(userId: string): string[] {
  if (!userId) return [];
  return read()
    .filter((entry) => entry.userId === userId)
    .map((entry) => entry.lotId);
}

export function untastedShopLotIds(userId: string, records: TastingRecord[]): string[] {
  const tasted = new Set(records.filter((record) => record.userId === userId).map((record) => record.lotId));
  return getShopLotIds(userId).filter((lotId) => !tasted.has(lotId));
}
