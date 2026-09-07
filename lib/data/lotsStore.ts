'use client';

import type { Lot, Roaster } from '@/lib/types/coffee';
import type { LotRow, ReferenceTasteProfileRow, RoasterOrgRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { LOTS as SEED_LOTS } from './lots';

// Roaster-created/edited lots layer on top of the static seed data, the same
// way TastingRecord does for journey entries (see lib/journey/store.ts): no
// backend yet, so the roaster's own edits live in localStorage and are
// merged with the seed lots at read time. Overrides win on id collision,
// which is also how editing an existing (seed) lot works.
//
// Stage 4 (Canonical Lot implementation, Phase 4.4): syncLotsFromSupabase()
// below overlays the real public.lots catalog (see
// supabase/migrations/0022_canonical_lot_core.sql) onto this same override
// cache, exactly the way syncCafeMenuFromSupabase() already does for
// lib/data/cafeMenuStore.ts. Until the one-time backfill script
// (scripts/migrate-canonical-lot.ts) has actually been run against a given
// Supabase project, this query simply returns no rows (or the table itself
// may not exist yet) and every consumer keeps seeing exactly what it saw
// before this change — seed + localStorage, unchanged.
//
// Lot CREATION/EDITING (saveLot, generateLotId below) is NOT switched to
// Supabase in this pass — see the comment on saveLot for why.

const STORAGE_KEY = 'coffee-passport:lots';

let cache: Lot[] | null = null;
const listeners = new Set<() => void>();

// Lot has grown fields since this store's earliest deploys (e.g. variety,
// added after some roaster edits were already saved) — a browser with an
// old-shaped override in localStorage would otherwise hand out a lot
// missing that field. Backfilling here, once, means every consumer trusts
// the Lot type instead of re-guessing a fallback (see the same idiom in
// lib/journey/store.ts for TastingRecord).
function normalizeLot(lot: Lot): Lot {
  return {
    ...lot,
    variety: lot.variety ?? '',
    inRoasterCatalog: lot.inRoasterCatalog ?? true,
  };
}

function readOverrides(): Lot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Lot[]) : [];
    return parsed.map(normalizeLot);
  } catch {
    return [];
  }
}

function computeAll(): Lot[] {
  const merged = new Map<string, Lot>();
  for (const lot of SEED_LOTS) merged.set(lot.id, lot);
  for (const lot of readOverrides()) merged.set(lot.id, lot);
  return Array.from(merged.values());
}

function read(): Lot[] {
  if (typeof window === 'undefined') return SEED_LOTS;
  if (!cache) cache = computeAll();
  return cache;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Lot[] {
  return read();
}

export function getServerSnapshot(): Lot[] {
  return SEED_LOTS;
}

export function getMergedLotById(id: string): Lot | undefined {
  return read().find((lot) => lot.id === id);
}

type LotWithRefs = LotRow & {
  roasters: Pick<RoasterOrgRow, 'slug'> | null;
  reference_taste_profiles: Pick<ReferenceTasteProfileRow, 'status' | 'acidity' | 'sweetness' | 'body' | 'bitterness'>[];
};

// Maps one canonical `lots` row (joined with its roaster slug and taste
// profile versions) back onto the existing client-facing Lot shape, so
// every current consumer of useLots()/getMergedLotById() keeps working
// unmodified. Fields the canonical schema doesn't carry yet (variety,
// process, cropYear, producer story, descriptors sub-shape) fall back to
// whatever a same-public_id seed/localStorage entry already has, since this
// migration's own scope (Stage 3 §01/§C) never asked those fields to move
// off Coffee/Green Lot in a way this mapper would need to reconstruct here.
function rowToLot(row: LotWithRefs, fallback: Lot | undefined): Lot {
  const activeTaste = row.reference_taste_profiles.find((p) => p.status === 'active') ?? null;

  return {
    id: row.public_id,
    roasterId: row.roasters?.slug ?? fallback?.roasterId ?? '',
    name: row.name,
    country: fallback?.country ?? '',
    region: fallback?.region ?? '',
    variety: fallback?.variety ?? '',
    process: fallback?.process ?? '',
    cropYear: fallback?.cropYear ?? '',
    qGrade: row.q_grade ?? fallback?.qGrade ?? 0,
    roastProfile: row.roast_profile_label || fallback?.roastProfile || '',
    roastType: (row.roast_type || fallback?.roastType || 'filter') as Lot['roastType'],
    descriptors: row.descriptors.length > 0 ? row.descriptors : fallback?.descriptors ?? [],
    roasterFlavorProfile: activeTaste
      ? {
          acidity: activeTaste.acidity,
          sweetness: activeTaste.sweetness,
          body: activeTaste.body,
          bitterness: activeTaste.bitterness,
        }
      : fallback?.roasterFlavorProfile ?? { acidity: 0, sweetness: 0, body: 0, bitterness: 0 },
    inRoasterCatalog: row.in_roaster_catalog,
    producer: fallback?.producer ?? { farmerName: '', farmName: '', altitude: '', story: '' },
  };
}

// Pulls the canonical Lot catalog from Supabase (public read, no auth
// needed — see 0025_canonical_lot_rls.sql) and overlays it onto the local
// cache, same idiom as cafeMenuStore.syncCafeMenuFromSupabase(). Safe to
// call from any surface that reads the catalog: /scan, /passport/[lotId],
// the roaster dashboard, cafe add-lot. A canonical row always wins over a
// same-public_id seed/localStorage entry once one exists, since Supabase is
// the intended source of truth going forward (Stage 3 §11) — but until the
// migration script has actually populated it for a given lot, that lot's
// seed/localStorage version is untouched.
export async function syncLotsFromSupabase(): Promise<void> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('lots')
      .select('*, roasters(slug), reference_taste_profiles(status, acidity, sweetness, body, bitterness)');
    if (error || !data) return;

    const current = computeAll();
    const byId = new Map(current.map((lot) => [lot.id, lot]));
    for (const row of data as unknown as LotWithRefs[]) {
      byId.set(row.public_id, rowToLot(row, byId.get(row.public_id)));
    }

    const overrides = readOverrides();
    const overrideIds = new Set(overrides.map((lot) => lot.id));
    const merged = Array.from(byId.values()).map((lot) => (overrideIds.has(lot.id) ? overrides.find((o) => o.id === lot.id)! : lot));

    // Write only the entries that didn't already come from a local
    // roaster edit, so a roaster's own unsaved-to-Supabase change (Phase
    // 4.5, not yet built) is never clobbered by this read-only sync.
    const canonicalOnly = merged.filter((lot) => !overrideIds.has(lot.id));
    cache = [...overrides, ...canonicalOnly];
    listeners.forEach((listener) => listener());
  } catch {
    // Offline / migrations not applied yet in this environment — local
    // cache (seed + localStorage) stands, exactly as before this change.
  }
}

// Lot CREATE/EDIT still writes to localStorage only, not Supabase, in this
// pass. Reason: the canonical `lots` table requires a green_lot_id (Stage 3
// §02/§06 — every Lot belongs to exactly one Green Lot) and a real
// roaster_id uuid resolved from the roaster's slug, and today's
// LotBuilderForm has no Green Lot concept in its UI at all. Synthesizing a
// placeholder Green Lot per save here would invent an entity Stage 3 §09
// explicitly warns against, and would fabricate a relationship (Rule: never
// invent a mapping/connection that isn't real). Switching Lot writes to
// Supabase is Stage 4 Phase 4.5, deferred as its own reviewable step once
// the roaster dashboard actually has somewhere to pick or create a Green
// Lot from.
export function saveLot(lot: Lot): void {
  const overrides = readOverrides();
  const index = overrides.findIndex((existing) => existing.id === lot.id);
  if (index >= 0) overrides[index] = lot;
  else overrides.push(lot);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — the in-memory cache below still reflects the
    // save for the rest of this session.
  }
  cache = computeAll();
  listeners.forEach((listener) => listener());
}

export function generateLotId(roaster: Roaster, country: string): string {
  const roasterCode = (roaster.slug.split('-')[0] || roaster.slug).slice(0, 3).toUpperCase();
  const countryCode = (country.trim() || 'XXX').slice(0, 3).toUpperCase();
  const existingIds = new Set(read().map((lot) => lot.id));

  let sequence = 1;
  let id = '';
  do {
    id = `LOT-${roasterCode}-${countryCode}-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (existingIds.has(id));

  return id;
}
