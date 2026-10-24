import type { LotStatus } from '@/lib/types/database';

// Which screen /passport/[lotId] renders — extracted out of page.tsx for the
// same reason as blindTastingGate.ts (a page file may only export a fixed
// set of names) so the guest's two entry paths are directly testable (see
// passportView.test.ts).
//
// After a QR scan the guest picks an entry:
//   'cafe' — "Я в кофейне": the blind cupping path, unchanged — shop pick
//            ('location'), the lock ('blind-lock'), the taste flow, then the
//            roaster's profile only once a tasting is saved ('revealed').
//   'shop' — "Я в магазине": the canonical lot straight away ('lot-info');
//            cupping stays available from there, and the resulting tasting
//            is stamped profile_seen_before_tasting (see profileSeenFlag.ts).
export type PassportEntry = 'cafe' | 'shop';

export type PassportView = 'preview' | 'choice' | 'lot-info' | 'location' | 'draft' | 'blind-lock' | 'revealed';

export interface PassportViewInput {
  isPreview: boolean;
  entry: PassportEntry | null;
  shopId: string | null;
  hasTastingHere: boolean;
  canonicalStatus: LotStatus | null;
}

export function resolvePassportView({
  isPreview,
  entry,
  shopId,
  hasTastingHere,
  canonicalStatus,
}: PassportViewInput): PassportView {
  if (isPreview) return 'preview';
  // A shop is only ever set on the blind path: picked on 'location', or
  // handed back by the taste flow (markPendingShop) right after a save — so
  // returning from a tasting skips the entry choice.
  if (shopId) {
    if (hasTastingHere) return 'revealed';
    return canonicalStatus === 'draft' ? 'draft' : 'blind-lock';
  }
  if (entry === 'shop') return 'lot-info';
  if (entry === 'cafe') return 'location';
  return 'choice';
}

// The roaster's flavor profile and notes — the blind path's spoiler.
export function isLotProfileVisible(view: PassportView): boolean {
  return view === 'preview' || view === 'lot-info' || view === 'revealed';
}

// Only a guest opening the lot before cupping counts as "seen before
// tasting"; the post-tasting reveal and the business preview do not.
export function shouldMarkProfileSeen(view: PassportView): boolean {
  return view === 'lot-info';
}
