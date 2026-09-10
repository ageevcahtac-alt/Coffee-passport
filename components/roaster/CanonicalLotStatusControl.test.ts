import { describe, expect, it } from 'vitest';
import { isReadyForActive } from './CanonicalLotStatusControl';
import type { CanonicalLot } from '@/lib/data/canonicalLotStore';

// Phase 4.5.10's readiness gate for draft/testing -> active (see the
// function's own comment): a Lot with no name or no real Q-Score must
// never be allowed to go live, since a 0.0 Q-Score renders as the
// prominent visual centerpiece of the guest-facing Passport, not a
// graceful empty state. This had zero test coverage
// (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md).
function makeLot(overrides: Partial<CanonicalLot> = {}): CanonicalLot {
  return {
    id: 'lot-uuid-1',
    publicId: 'LOT-XO-ETH-001',
    roasterId: 'roaster-uuid-1',
    greenLotId: 'green-lot-uuid-1',
    name: 'Ethiopia Yirgacheffe',
    descriptors: [],
    qGrade: 87,
    roastType: 'filter',
    roastProfileLabel: '',
    status: 'draft',
    inRoasterCatalog: true,
    ...overrides,
  };
}

describe('CanonicalLotStatusControl — isReadyForActive', () => {
  it('passes a lot with a real name and a positive Q-Score', () => {
    expect(isReadyForActive(makeLot())).toBe(true);
  });

  it('blocks an empty name', () => {
    expect(isReadyForActive(makeLot({ name: '' }))).toBe(false);
  });

  it('blocks a whitespace-only name', () => {
    expect(isReadyForActive(makeLot({ name: '   ' }))).toBe(false);
  });

  it('blocks a null Q-Score', () => {
    expect(isReadyForActive(makeLot({ qGrade: null }))).toBe(false);
  });

  it('blocks a zero Q-Score (the exact bug this gate exists to prevent)', () => {
    expect(isReadyForActive(makeLot({ qGrade: 0 }))).toBe(false);
  });

  it('blocks a negative Q-Score', () => {
    expect(isReadyForActive(makeLot({ qGrade: -1 }))).toBe(false);
  });
});
