// Pure domain logic for the Canonical Lot model (Stage 3 architecture,
// Stage 4 implementation). Deliberately framework/IO-free — no Supabase
// client, no fetch, no filesystem — so it can be unit tested without a
// database and reused by both the one-time migration script
// (scripts/migrate-canonical-lot.ts) and, later, the application's own
// roaster-facing Lot create/edit flow once that switches to Supabase
// (Stage 4 Phase 4.5, not part of this pass).

// =========================================================
// Public Lot ID generation — server-side equivalent of today's
// lib/data/lotsStore.ts generateLotId(), which only checks uniqueness
// against one browser's localStorage. This version takes the real set of
// existing ids (from a DB query) so collisions are actually impossible,
// not just unlikely.
// =========================================================
export function generatePublicLotId(
  roasterSlug: string,
  country: string,
  existingPublicIds: ReadonlySet<string>
): string {
  const roasterCode = (roasterSlug.split('-')[0] || roasterSlug).slice(0, 3).toUpperCase();
  const countryCode = (country.trim() || 'XXX').slice(0, 3).toUpperCase();

  let sequence = 1;
  let id = '';
  do {
    id = `LOT-${roasterCode}-${countryCode}-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (existingPublicIds.has(id));

  return id;
}

// =========================================================
// Legacy lot_id resolution — matches historical text values (from
// checkins.lot_id / recipes.lot_id / cafe_menu_entries.lot_id) against the
// canonical lots created during migration, by exact public_id match only.
//
// Stage 4 §14 / §33 rule, enforced here structurally rather than by
// discipline: no fuzzy matching, no "closest" guess, no fabricated
// mapping. A legacy id either matches an existing public_id exactly, or it
// is reported unmapped — never silently invented.
// =========================================================
export interface LegacyLotResolution {
  mapped: Array<{ legacyId: string; lotId: string }>;
  unmapped: string[];
}

export function resolveLegacyLotIds(
  legacyIds: readonly string[],
  publicIdToLotId: ReadonlyMap<string, string>
): LegacyLotResolution {
  const mapped: Array<{ legacyId: string; lotId: string }> = [];
  const unmapped: string[] = [];

  // Dedupe input while preserving first-seen order, since the same legacy
  // lot_id typically repeats across many checkins/recipes rows.
  const seen = new Set<string>();
  for (const raw of legacyIds) {
    const legacyId = raw.trim();
    if (!legacyId || seen.has(legacyId)) continue;
    seen.add(legacyId);

    const lotId = publicIdToLotId.get(legacyId);
    if (lotId) {
      mapped.push({ legacyId, lotId });
    } else {
      unmapped.push(legacyId);
    }
  }

  return { mapped, unmapped };
}

// =========================================================
// public_id collision detection across multiple sources feeding the same
// migration run (e.g. two roasters' seed catalogs, or seed + a
// browser-exported localStorage catalog). Stage 4 §14: a conflict must be
// reported, never resolved by picking one side.
// =========================================================
export interface PublicIdConflict {
  publicId: string;
  occurrences: number;
}

export function detectPublicIdConflicts(publicIds: readonly string[]): PublicIdConflict[] {
  const counts = new Map<string, number>();
  for (const id of publicIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([publicId, occurrences]) => ({ publicId, occurrences }));
}

// =========================================================
// Seed-vs-existing partitioning — fixes a real bug found in pre-migration
// review: the migration script originally built its public_id -> lots.id
// lookup map only from the seed lots it happened to process in the current
// run, never from a full `select id, public_id from lots` of what already
// exists in Supabase. A legacy lot_id matching a Lot that exists for any
// other reason (a prior run, or any future non-seed write) would then be
// incorrectly reported unmapped instead of resolving to its real row.
//
// Fix: callers must build `publicIdToLotId` from a full table read FIRST,
// then partition the seed list against that complete map — never the
// reverse. A seed lot found in the map is `existing` (already canonical,
// skip creation, never touch it again); only lots genuinely absent from
// the full map are `missing` and need to be created.
// =========================================================
export interface SeedLotPartition<T> {
  existing: Array<{ seed: T; lotId: string }>;
  missing: T[];
}

export function partitionSeedLotsByExisting<T extends { id: string }>(
  seedLots: readonly T[],
  publicIdToLotId: ReadonlyMap<string, string>
): SeedLotPartition<T> {
  const existing: Array<{ seed: T; lotId: string }> = [];
  const missing: T[] = [];

  for (const seed of seedLots) {
    const lotId = publicIdToLotId.get(seed.id);
    if (lotId) {
      existing.push({ seed, lotId });
    } else {
      missing.push(seed);
    }
  }

  return { existing, missing };
}

// =========================================================
// Reference profile version transitions (Reference Roast Profile and
// Reference Taste Profile share this exact rule — Stage 3 §06/§07/§25).
// Activating a new version never mutates the row it replaces: the previous
// `active` row (if any) transitions to `superseded`, and the new row is
// inserted as `active`. This function only computes what should happen —
// callers perform the actual two-step write (never a single UPDATE that
// rewrites history).
// =========================================================
export type ReferenceProfileStatus = 'draft' | 'active' | 'superseded';

export interface VersionedProfileRow {
  id: string;
  version: number;
  status: ReferenceProfileStatus;
}

export interface VersionActivationPlan {
  supersedeId: string | null; // the currently-active row's id, if any, to flip to 'superseded'
  nextVersion: number; // the version number the newly-activated row should carry
}

export function planVersionActivation(existingVersions: readonly VersionedProfileRow[]): VersionActivationPlan {
  const currentlyActive = existingVersions.find((v) => v.status === 'active') ?? null;
  const highestVersion = existingVersions.reduce((max, v) => Math.max(max, v.version), 0);

  return {
    supersedeId: currentlyActive ? currentlyActive.id : null,
    nextVersion: highestVersion + 1,
  };
}
