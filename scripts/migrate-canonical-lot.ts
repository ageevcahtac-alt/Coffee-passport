// One-time Canonical Lot migration script — Stage 4 Phase 4.2/4.3.
//
// NOT executed automatically and NOT wired into any build/deploy step.
// This is a manual, operator-run utility, matching Stage 4 §16's explicit
// requirement: localStorage lives in a browser, a server-side script has
// no access to it, so this script only migrates SEED data (lib/data/*.ts)
// plus the LEGACY TEXT lot_id already sitting in Supabase
// (checkins/recipes/cafe_menu_entries). It cannot and does not touch any
// individual user's browser-local Lot catalog — see the README block at
// the bottom of this file for that separate, smaller admin-utility need.
//
// Prerequisites before running this:
//   1. Migrations 0022-0025 must already be applied to the target Supabase
//      project (this script does not apply them).
//   2. SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set
//      in the environment this script runs in (service role, not anon —
//      the new tables' RLS restricts writes to roaster staff, and this
//      script is not signed in as anyone).
//
// Run with: npx tsx scripts/migrate-canonical-lot.ts
// (or compile with tsc and run the emitted .js — no new runtime dependency
// is required beyond @supabase/supabase-js, already in package.json).
//
// Rule followed throughout (Stage 4 §14/§32): if something cannot be
// mapped unambiguously, it is recorded as unresolved in the report below.
// Nothing here invents a Lot, guesses a "closest" match, or backfills a
// historical reference-profile version that cannot be reconstructed.

import { createClient } from '@supabase/supabase-js';
import { SEED_ROASTERS } from '../lib/data/roasters';
import { LOTS as SEED_LOTS } from '../lib/data/lots';
import {
  resolveLegacyLotIds,
  detectPublicIdConflicts,
  partitionSeedLotsByExisting,
} from '../lib/server/canonicalLot';

interface MigrationReport {
  roasters: { created: number; skipped: number; conflicts: string[] };
  coffees: { created: number; skipped: number };
  greenLots: { created: number; skipped: number };
  lots: { created: number; skipped: number; conflicts: string[] };
  referenceTasteProfiles: { created: number; skipped: number };
  legacyLotId: {
    table: string;
    total: number;
    mapped: number;
    unmapped: string[];
  }[];
  checkins: { total: number; withLotFk: number; withoutLotFk: number };
  recipes: { total: number; withLotFk: number; withoutLotFk: number };
  cafeMenuEntries: { total: number; withLotFk: number; withoutLotFk: number };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. This script must run with service-role credentials — see the ` +
        `prerequisites comment at the top of this file. Refusing to proceed with anon-level ` +
        `access, since it cannot write to the new tables' RLS-restricted rows anyway.`
    );
  }
  return value;
}

async function main() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report: MigrationReport = {
    roasters: { created: 0, skipped: 0, conflicts: [] },
    coffees: { created: 0, skipped: 0 },
    greenLots: { created: 0, skipped: 0 },
    lots: { created: 0, skipped: 0, conflicts: [] },
    referenceTasteProfiles: { created: 0, skipped: 0 },
    legacyLotId: [],
    checkins: { total: 0, withLotFk: 0, withoutLotFk: 0 },
    recipes: { total: 0, withLotFk: 0, withoutLotFk: 0 },
    cafeMenuEntries: { total: 0, withLotFk: 0, withoutLotFk: 0 },
  };

  // ---------------------------------------------------------------
  // Step 1 — Roasters. Idempotent: relies on roasters.slug being unique,
  // so re-running this script is safe (it will just skip existing rows).
  // ---------------------------------------------------------------
  const roasterIdBySlug = new Map<string, string>();
  for (const roaster of SEED_ROASTERS) {
    const { data: existing } = await supabase.from('roasters').select('id').eq('slug', roaster.id).maybeSingle();
    if (existing) {
      roasterIdBySlug.set(roaster.id, existing.id);
      report.roasters.skipped += 1;
      continue;
    }
    const { data: inserted, error } = await supabase
      .from('roasters')
      .insert({ slug: roaster.id, name: roaster.name })
      .select('id')
      .single();
    if (error || !inserted) {
      report.roasters.conflicts.push(`${roaster.id}: ${error?.message ?? 'unknown insert failure'}`);
      continue;
    }
    roasterIdBySlug.set(roaster.id, inserted.id);
    report.roasters.created += 1;
  }

  // ---------------------------------------------------------------
  // Step 2a — Load the FULL canonical mapping from Supabase before touching
  // seed data at all. This is the fix for the bug found in pre-migration
  // review: the previous version only ever learned about lots it created
  // in the current run, so any Lot already present for any other reason
  // (a prior run, or any future non-seed write) would be misreported as
  // unmapped later in Step 3. One query, done once, before any decision
  // about what needs creating.
  // ---------------------------------------------------------------
  const { data: existingLotRows, error: existingLotsError } = await supabase.from('lots').select('id, public_id');
  if (existingLotsError) {
    throw new Error(`Failed to load existing lots for the canonical mapping: ${existingLotsError.message}`);
  }

  const lotIdByPublicId = new Map<string, string>(); // public_id -> lots.id (uuid)
  for (const row of existingLotRows ?? []) {
    lotIdByPublicId.set(row.public_id, row.id);
  }

  // ---------------------------------------------------------------
  // Step 2b — Coffee (origin) + Green Lot + Lot, but only for seed Lots
  // that the full mapping above shows are genuinely absent. A seed Lot
  // already present (`existing`, from this table or from a prior run) is
  // never re-created — partitionSeedLotsByExisting is the same pure logic
  // covered by canonicalLot.test.ts, so this split is exactly what's
  // tested there, not a fresh ad-hoc check.
  //
  // Seed data has no separate Coffee/GreenLot records — only the flat Lot
  // shape. Per Stage 3, one Coffee + one Green Lot is created per distinct
  // MISSING seed Lot as its origin/physical-batch backing, since there is
  // no existing data richer than that to split from. This is a one-time
  // seed convenience, not a general rule for future roaster-authored Lots
  // (which should create Coffee/Green Lot explicitly going forward).
  // ---------------------------------------------------------------
  const seedPublicIds = SEED_LOTS.map((lot) => lot.id);
  const seedConflicts = detectPublicIdConflicts(seedPublicIds);
  if (seedConflicts.length > 0) {
    report.lots.conflicts.push(...seedConflicts.map((c) => `duplicate seed public_id ${c.publicId} (${c.occurrences}x)`));
  }

  const { existing: alreadyCanonicalSeedLots, missing: missingSeedLots } = partitionSeedLotsByExisting(
    SEED_LOTS,
    lotIdByPublicId
  );
  report.lots.skipped += alreadyCanonicalSeedLots.length;
  // The map already has every one of these from Step 2a — nothing further
  // to do for them, they are intentionally never touched again.

  for (const lot of missingSeedLots) {
    const roasterId = roasterIdBySlug.get(lot.roasterId);
    if (!roasterId) {
      report.lots.conflicts.push(`${lot.id}: unresolved roasterId '${lot.roasterId}' — skipped, not guessed`);
      continue;
    }

    const { data: coffee, error: coffeeError } = await supabase
      .from('coffees')
      .insert({
        roaster_id: roasterId,
        country: lot.country,
        region: lot.region,
        farm: lot.producer.farmName,
        producer: lot.producer.farmerName,
        variety: lot.variety,
        altitude: lot.producer.altitude,
        processing: lot.process,
        harvest_year: lot.cropYear,
      })
      .select('id')
      .single();
    if (coffeeError || !coffee) {
      report.lots.conflicts.push(`${lot.id}: failed to create backing Coffee — ${coffeeError?.message}`);
      continue;
    }
    report.coffees.created += 1;

    const { data: greenLot, error: greenLotError } = await supabase
      .from('green_lots')
      .insert({ coffee_id: coffee.id, roaster_id: roasterId, notes: 'Backfilled from seed Lot — no separate physical-batch record existed.' })
      .select('id')
      .single();
    if (greenLotError || !greenLot) {
      report.lots.conflicts.push(`${lot.id}: failed to create backing Green Lot — ${greenLotError?.message}`);
      continue;
    }
    report.greenLots.created += 1;

    const { data: insertedLot, error: lotError } = await supabase
      .from('lots')
      .insert({
        public_id: lot.id,
        roaster_id: roasterId,
        green_lot_id: greenLot.id,
        name: lot.name,
        descriptors: lot.descriptors,
        q_grade: lot.qGrade,
        roast_type: lot.roastType,
        roast_profile_label: lot.roastProfile,
        status: lot.inRoasterCatalog ? 'active' : 'archived',
        in_roaster_catalog: lot.inRoasterCatalog,
        legacy_text_id: lot.id,
      })
      .select('id')
      .single();
    if (lotError || !insertedLot) {
      report.lots.conflicts.push(`${lot.id}: failed to create Lot row — ${lotError?.message}`);
      continue;
    }
    lotIdByPublicId.set(lot.id, insertedLot.id);
    report.lots.created += 1;

    const { error: tasteProfileError } = await supabase.from('reference_taste_profiles').insert({
      lot_id: insertedLot.id,
      version: 1,
      status: 'active',
      acidity: lot.roasterFlavorProfile.acidity,
      sweetness: lot.roasterFlavorProfile.sweetness,
      body: lot.roasterFlavorProfile.body,
      bitterness: lot.roasterFlavorProfile.bitterness,
    });
    if (tasteProfileError) {
      report.referenceTasteProfiles.skipped += 1;
    } else {
      report.referenceTasteProfiles.created += 1;
    }
  }

  // ---------------------------------------------------------------
  // Step 3 — Legacy lot_id backfill on checkins/recipes/cafe_menu_entries.
  // Reads every DISTINCT existing text lot_id, resolves what it can against
  // lotIdByPublicId (built above from what this run actually created/found
  // — not a guess), and writes lot_ref only for exact matches.
  // ---------------------------------------------------------------
  const tables: Array<{ name: 'checkins' | 'recipes' | 'cafe_menu_entries'; column: 'lot_id' }> = [
    { name: 'checkins', column: 'lot_id' },
    { name: 'recipes', column: 'lot_id' },
    { name: 'cafe_menu_entries', column: 'lot_id' },
  ];

  for (const table of tables) {
    const { data: rows, error } = await supabase.from(table.name).select(`id, ${table.column}`);
    if (error || !rows) {
      report.legacyLotId.push({ table: table.name, total: 0, mapped: 0, unmapped: [`query failed: ${error?.message}`] });
      continue;
    }

    const legacyIds = rows.map((row: any) => row[table.column] as string);
    const { mapped, unmapped } = resolveLegacyLotIds(legacyIds, lotIdByPublicId);

    for (const { legacyId, lotId } of mapped) {
      const { error: updateError } = await supabase.from(table.name).update({ lot_ref: lotId }).eq(table.column, legacyId);
      if (updateError) {
        unmapped.push(`${legacyId} (matched but write failed: ${updateError.message})`);
      }
    }

    report.legacyLotId.push({
      table: table.name,
      total: new Set(legacyIds.filter(Boolean)).size,
      mapped: mapped.length,
      unmapped,
    });

    const summary =
      table.name === 'checkins' ? report.checkins : table.name === 'recipes' ? report.recipes : report.cafeMenuEntries;
    summary.total = rows.length;
    const { count: withFk } = await supabase
      .from(table.name)
      .select('id', { count: 'exact', head: true })
      .not('lot_ref', 'is', null);
    summary.withLotFk = withFk ?? 0;
    summary.withoutLotFk = rows.length - (withFk ?? 0);
  }

  // ---------------------------------------------------------------
  // Report — Stage 4 §33, printed as JSON so it can be pasted into the
  // review/PR description rather than re-derived from logs.
  // ---------------------------------------------------------------
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Canonical Lot migration failed:', error);
  process.exitCode = 1;
});

// =========================================================
// Browser-local data note (Stage 4 §16)
//
// If any real roaster has created Lots/roast profiles that exist ONLY in
// their own browser's localStorage (coffee-passport:lots /
// coffee-passport:roast-profiles) — as opposed to the seed catalog this
// script migrates above — this script cannot see or migrate them; a
// server process has no access to another machine's localStorage.
//
// That case needs a small, separate, one-time IMPORT utility that:
//   1. runs in that roaster's own browser (e.g. a temporary admin page or
//      a snippet run from devtools),
//   2. reads window.localStorage.getItem('coffee-passport:lots') /
//      ('coffee-passport:roast-profiles'),
//   3. POSTs that JSON to a small authenticated admin API route,
//   4. which then runs the same generatePublicLotId / resolveLegacyLotIds
//      logic from lib/server/canonicalLot.ts server-side, reports what it
//      found/created/conflicted (same shape as MigrationReport above), and
//      never auto-resolves a naming collision against seed data.
//
// That utility is explicitly NOT built in this pass: Stage 4 §16 asks only
// to design for it ("может быть temporary dev/admin migration utility"),
// and building it now — before we know whether any real non-seed
// localStorage Lot data exists at all in production — would be scope this
// stage doesn't need yet. Flagging it here as the next concrete step
// rather than silently skipping it.
