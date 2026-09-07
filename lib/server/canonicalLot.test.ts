import { describe, expect, it } from 'vitest';
import {
  generatePublicLotId,
  resolveLegacyLotIds,
  detectPublicIdConflicts,
  planVersionActivation,
  partitionSeedLotsByExisting,
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

describe('partitionSeedLotsByExisting', () => {
  // Regression coverage for the pre-migration review bug: the migration
  // script originally built its lookup map only from lots it created in
  // the current run, never from a full `select id, public_id from lots` —
  // so a Lot already present for any other reason (a prior run, or any
  // real non-seed Lot) would be wrongly treated as if it didn't exist.

  it(
    'reproduces the reported bug scenario: an existing non-seed Lot resolves to its real UUID, ' +
      'is never re-created, and its legacy lot_id maps to it — not unmapped, not a new Lot, not a duplicate',
    () => {
      // Supabase already has a canonical Lot for LOT-XO-ETH-001 (created by
      // some means other than this migration run — a prior run, or a real
      // roaster write). It is NOT part of the current seed batch below.
      const fullMappingFromSupabase = new Map([['LOT-XO-ETH-001', 'existing-uuid-123']]);

      // This run's seed batch is a completely different lot — models the
      // real shape of the bug: SEED_LOTS never even mentions
      // LOT-XO-ETH-001, so the old buggy code (which only learned about
      // lots it personally created from SEED_LOTS) could never have put it
      // in the map at all.
      const seedBatch = [{ id: 'LOT-NS-KEN-002' }];
      const { existing, missing } = partitionSeedLotsByExisting(seedBatch, fullMappingFromSupabase);

      // The seed batch's own lot is missing (needs creating) — unrelated to
      // the bug, just confirms the partition still works normally.
      expect(missing).toEqual([{ id: 'LOT-NS-KEN-002' }]);
      expect(existing).toEqual([]);

      // The actual regression check: a legacy checkin/recipe/menu-entry
      // referencing LOT-XO-ETH-001 — a lot this run never touched or
      // created — must still resolve against the full mapping.
      const legacyCheckinLotIds = ['LOT-XO-ETH-001'];
      const { mapped, unmapped } = resolveLegacyLotIds(legacyCheckinLotIds, fullMappingFromSupabase);

      expect(unmapped).toEqual([]); // NOT unmapped
      expect(mapped).toEqual([{ legacyId: 'LOT-XO-ETH-001', lotId: 'existing-uuid-123' }]); // resolves to the real existing UUID
      // NOT a new Lot / NOT a duplicate: nothing above ever added
      // 'LOT-XO-ETH-001' to `missing`, so no create-Lot code path is ever
      // reached for it.
    }
  );

  it('an existing Lot that also happens to appear in the seed batch is recognized as existing, not re-created', () => {
    const fullMapping = new Map([['LOT-XO-ETH-001', 'existing-uuid-123']]);
    const seedBatch = [{ id: 'LOT-XO-ETH-001' }, { id: 'LOT-NS-KEN-002' }];

    const { existing, missing } = partitionSeedLotsByExisting(seedBatch, fullMapping);

    expect(existing).toEqual([{ seed: { id: 'LOT-XO-ETH-001' }, lotId: 'existing-uuid-123' }]);
    expect(missing).toEqual([{ id: 'LOT-NS-KEN-002' }]);
  });

  it('a genuinely new seed lot (absent from the full mapping) is correctly classified as missing', () => {
    const fullMapping = new Map<string, string>(); // Supabase has no canonical lots at all yet
    const seedBatch = [{ id: 'LOT-XO-ETH-001' }];

    const { existing, missing } = partitionSeedLotsByExisting(seedBatch, fullMapping);

    expect(existing).toEqual([]);
    expect(missing).toEqual([{ id: 'LOT-XO-ETH-001' }]);
  });

  it('re-running against a fully-migrated mapping classifies every seed lot as existing — idempotent, no duplicates', () => {
    const fullMapping = new Map([
      ['LOT-XO-ETH-001', 'uuid-1'],
      ['LOT-XO-COL-004', 'uuid-2'],
      ['LOT-NS-KEN-002', 'uuid-3'],
      ['LOT-NS-ETH-003', 'uuid-4'],
    ]);
    const seedBatch = [
      { id: 'LOT-XO-ETH-001' },
      { id: 'LOT-XO-COL-004' },
      { id: 'LOT-NS-KEN-002' },
      { id: 'LOT-NS-ETH-003' },
    ];

    const { existing, missing } = partitionSeedLotsByExisting(seedBatch, fullMapping);

    expect(missing).toEqual([]); // nothing left to create on a second run
    expect(existing).toHaveLength(4); // every seed lot already accounted for
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
