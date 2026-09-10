import { describe, expect, it } from 'vitest';
import { hasRevealedTasting } from './blindTastingGate';
import type { TastingRecord } from '@/lib/types/coffee';

// Blind-tasting spoiler protection (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md,
// C1): community tastings and the roaster's own reference profile must
// never be fetched (not just never rendered) until this exact guest has
// already saved a tasting for this exact (lot, shop) pair — otherwise the
// data is visible in the browser's network tab before the guest's own
// blind read, even if nothing renders it yet.
function record(overrides: Partial<TastingRecord> = {}): TastingRecord {
  return {
    id: 'record-1',
    userId: 'guest-1',
    lotId: 'LOT-XO-ETH-001',
    coffeeShopId: 'shop-xo-vsevolozhsk',
    roasterId: 'roaster-xo',
    createdAt: new Date().toISOString(),
    brewingMethod: 'v60',
    baristaId: 'unspecified',
    ...overrides,
  } as TastingRecord;
}

describe('passport/[lotId] — hasRevealedTasting (blind-tasting spoiler gate)', () => {
  it('is false with no shop selected yet', () => {
    expect(hasRevealedTasting([record()], 'LOT-XO-ETH-001', null, 'guest-1')).toBe(false);
  });

  it('is false with no lot resolved yet', () => {
    expect(hasRevealedTasting([record()], undefined, 'shop-xo-vsevolozhsk', 'guest-1')).toBe(false);
  });

  it('is false when no matching tasting exists for this (lot, shop, user) triple', () => {
    expect(hasRevealedTasting([], 'LOT-XO-ETH-001', 'shop-xo-vsevolozhsk', 'guest-1')).toBe(false);
  });

  it('is false for a tasting saved at a different shop', () => {
    const journey = [record({ coffeeShopId: 'shop-other' })];
    expect(hasRevealedTasting(journey, 'LOT-XO-ETH-001', 'shop-xo-vsevolozhsk', 'guest-1')).toBe(false);
  });

  it('is false for another guest\'s tasting at the same shop/lot', () => {
    const journey = [record({ userId: 'guest-2' })];
    expect(hasRevealedTasting(journey, 'LOT-XO-ETH-001', 'shop-xo-vsevolozhsk', 'guest-1')).toBe(false);
  });

  it('is true once this exact guest has a saved tasting for this exact (lot, shop)', () => {
    const journey = [record()];
    expect(hasRevealedTasting(journey, 'LOT-XO-ETH-001', 'shop-xo-vsevolozhsk', 'guest-1')).toBe(true);
  });
});
