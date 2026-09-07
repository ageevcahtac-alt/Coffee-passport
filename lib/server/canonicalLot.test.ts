import { describe, expect, it } from 'vitest';
import {
  generatePublicLotId,
  resolveLegacyLotIds,
  detectPublicIdConflicts,
  planVersionActivation,
} from './canonicalLot';

// Covers the pure-logic cases from Stage 4 §35. Cases that are really DB
// constraints (public_id uniqueness enforced by the schema, an immutable
// roast_batches row rejecting UPDATE, "reject Lot without Green Lot" via
// `not null` FK) are validated by the migrations themselves (0022-0025),
// not re-asserted here in JS — this file only tests the logic this project
// actually owns as code.

describe('generatePublicLotId', () => {
  it('produces the existing LOT-{ROASTER}-{COUNTRY}-{SEQ} format unchanged', () => {
    const id = generatePublicLotId('roaster-xo', 'Ethiopia', new Set());
    expect(id).toBe('LOT-ROA-ETH-001');
  });

  it('never collides with an id already present in the real existing set', () => {
    const existing = new Set(['LOT-ROA-ETH-001', 'LOT-ROA-ETH-002']);
    const id = generatePublicLotId('roaster-xo', 'Ethiopia', existing);
    expect(id).toBe('LOT-ROA-ETH-003');
    expect(existing.has(id)).toBe(false);
  });
});

describe('resolveLegacyLotIds', () => {
  it('maps legacy ids that exactly match a known canonical public_id', () => {
    const known = new Map([['LOT-XO-ETH-001', 'uuid-1']]);
    const { mapped, unmapped } = resolveLegacyLotIds(['LOT-XO-ETH-001'], known);
    expect(mapped).toEqual([{ legacyId: 'LOT-XO-ETH-001', lotId: 'uuid-1' }]);
    expect(unmapped).toEqual([]);
  });

  it('reports an unmatched legacy id as unmapped rather than guessing', () => {
    const known = new Map([['LOT-XO-ETH-001', 'uuid-1']]);
    const { mapped, unmapped } = resolveLegacyLotIds(['LOT-DELETED-999'], known);
    expect(mapped).toEqual([]);
    expect(unmapped).toEqual(['LOT-DELETED-999']);
  });

  it('deduplicates repeated legacy ids without double-counting either bucket', () => {
    const known = new Map([['LOT-XO-ETH-001', 'uuid-1']]);
    const { mapped, unmapped } = resolveLegacyLotIds(
      ['LOT-XO-ETH-001', 'LOT-XO-ETH-001', 'LOT-GONE', 'LOT-GONE'],
      known
    );
    expect(mapped).toHaveLength(1);
    expect(unmapped).toEqual(['LOT-GONE']);
  });
});

describe('detectPublicIdConflicts', () => {
  it('reports an id seen more than once across combined sources', () => {
    const conflicts = detectPublicIdConflicts(['LOT-A-001', 'LOT-A-001', 'LOT-B-001']);
    expect(conflicts).toEqual([{ publicId: 'LOT-A-001', occurrences: 2 }]);
  });

  it('reports nothing when every id is unique', () => {
    expect(detectPublicIdConflicts(['LOT-A-001', 'LOT-B-001'])).toEqual([]);
  });
});

describe('planVersionActivation', () => {
  it('activating the first version supersedes nothing', () => {
    const plan = planVersionActivation([]);
    expect(plan).toEqual({ supersedeId: null, nextVersion: 1 });
  });

  it('activating v2 marks the currently active v1 to be superseded, not rewritten', () => {
    const existing = [
      { id: 'profile-v1', version: 1, status: 'active' as const },
    ];
    const plan = planVersionActivation(existing);
    expect(plan).toEqual({ supersedeId: 'profile-v1', nextVersion: 2 });
  });

  it('a superseded history does not get re-superseded by a later activation', () => {
    const existing = [
      { id: 'profile-v1', version: 1, status: 'superseded' as const },
      { id: 'profile-v2', version: 2, status: 'active' as const },
    ];
    const plan = planVersionActivation(existing);
    // Only the currently-active row (v2) is targeted — v1 is already
    // historical and must never be touched again.
    expect(plan).toEqual({ supersedeId: 'profile-v2', nextVersion: 3 });
  });
});
