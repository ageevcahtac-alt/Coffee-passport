'use client';

import type { CoffeeRow, GreenLotRow, LotRow, LotStatus } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generatePublicLotId } from '@/lib/server/canonicalLot';

// Canonical Lot write path — Stage 4.5 Phase 4.5.1.
//
// Unlike lib/data/lotsStore.ts (a useSyncExternalStore cache over
// seed+localStorage, overlaid read-only by Supabase), this file has no
// local-first cache to build: it's the write-path infrastructure for the
// Coffee -> Green Lot -> Lot creation flow that Phase 4.5.2 will wire a
// form onto. There is no local fallback here on purpose — a canonical
// write either succeeds against Supabase or it fails loudly, since Stage 3
// requires the canonical tables to be the one source of truth for this
// data, not a best-effort mirror of something localStorage already has.
//
// Every function here uses the ordinary anon-key browser client (see
// lib/supabase/browserClient.ts) under the signed-in roaster_admin's own
// session — RLS (0025_canonical_lot_rls.sql, is_roaster_staff_for())
// enforces who may actually write, not this file. No service-role key is
// used or needed at this layer.

export interface CanonicalCoffee {
  id: string; // uuid
  roasterId: string; // uuid
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  altitude: string;
  processing: string;
  harvestYear: string;
}

export interface CanonicalGreenLot {
  id: string; // uuid
  coffeeId: string;
  roasterId: string;
  purchasedKg: number | null;
  purchaseDate: string | null;
  contractReference: string;
  notes: string;
}

export interface CanonicalLot {
  id: string; // uuid PK — internal only, never shown to a user
  publicId: string; // e.g. "LOT-XO-ETH-001" — immutable, server-generated
  roasterId: string; // uuid
  greenLotId: string;
  name: string;
  descriptors: string[];
  qGrade: number | null;
  roastType: string;
  roastProfileLabel: string;
  status: LotStatus;
  inRoasterCatalog: boolean;
}

function rowToCoffee(row: CoffeeRow): CanonicalCoffee {
  return {
    id: row.id,
    roasterId: row.roaster_id,
    country: row.country,
    region: row.region,
    farm: row.farm,
    producer: row.producer,
    variety: row.variety,
    altitude: row.altitude,
    processing: row.processing,
    harvestYear: row.harvest_year,
  };
}

function rowToGreenLot(row: GreenLotRow): CanonicalGreenLot {
  return {
    id: row.id,
    coffeeId: row.coffee_id,
    roasterId: row.roaster_id,
    purchasedKg: row.purchased_kg,
    purchaseDate: row.purchase_date,
    contractReference: row.contract_reference,
    notes: row.notes,
  };
}

function rowToCanonicalLot(row: LotRow): CanonicalLot {
  return {
    id: row.id,
    publicId: row.public_id,
    roasterId: row.roaster_id,
    greenLotId: row.green_lot_id,
    name: row.name,
    descriptors: row.descriptors,
    qGrade: row.q_grade,
    roastType: row.roast_type,
    roastProfileLabel: row.roast_profile_label,
    status: row.status,
    inRoasterCatalog: row.in_roaster_catalog,
  };
}

// Bridges today's text roaster id ("roaster-xo", see lib/data/roasters.ts)
// to the real roasters.id uuid via roasters.slug — the same bridge
// is_roaster_staff_for() uses server-side (0025_canonical_lot_rls.sql).
// Returns null if this roaster has no canonical row yet (e.g. a demo
// roaster never touched by the backfill script) — callers must not
// fabricate a uuid for that case.
export async function resolveRoasterUuid(roasterSlug: string): Promise<string | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.from('roasters').select('id').eq('slug', roasterSlug).maybeSingle();
  if (error || !data) return null;
  return data.id;
}

// For the future "choose an existing Coffee" step (Phase 4.5.2). Returns
// every Coffee this roaster has ever recorded — no deduplication or
// "closest match" logic here; presenting the list and letting the roaster
// pick (or explicitly create new) is a UI decision, not this function's.
export async function listCoffeesForRoaster(roasterUuid: string): Promise<CanonicalCoffee[]> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('coffees')
    .select('*')
    .eq('roaster_id', roasterUuid)
    .order('created_at', { ascending: false });
  if (error || !data) throw new Error(`Failed to load coffees: ${error?.message ?? 'unknown error'}`);
  return (data as CoffeeRow[]).map(rowToCoffee);
}

export interface CreateCoffeeInput {
  roasterId: string; // uuid
  country: string;
  region?: string;
  farm?: string;
  producer?: string;
  variety?: string;
  altitude?: string;
  processing?: string;
  harvestYear?: string;
}

export async function createCoffee(input: CreateCoffeeInput): Promise<CanonicalCoffee> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('coffees')
    .insert({
      roaster_id: input.roasterId,
      country: input.country,
      region: input.region ?? '',
      farm: input.farm ?? '',
      producer: input.producer ?? '',
      variety: input.variety ?? '',
      altitude: input.altitude ?? '',
      processing: input.processing ?? '',
      harvest_year: input.harvestYear ?? '',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to create coffee: ${error?.message ?? 'unknown error'}`);
  return rowToCoffee(data as CoffeeRow);
}

// For the "use existing Green Lot" step (Scenario B — one physical batch
// producing several commercial Lots). Every Green Lot under this Coffee,
// newest first; the roaster picks one, or Phase 4.5.2 offers "new Green
// Lot" instead of calling this at all.
export async function listGreenLotsForCoffee(coffeeId: string): Promise<CanonicalGreenLot[]> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('green_lots')
    .select('*')
    .eq('coffee_id', coffeeId)
    .order('created_at', { ascending: false });
  if (error || !data) throw new Error(`Failed to load green lots: ${error?.message ?? 'unknown error'}`);
  return (data as GreenLotRow[]).map(rowToGreenLot);
}

export interface CreateGreenLotInput {
  coffeeId: string;
  roasterId: string; // uuid
  // Deliberately optional and never defaulted to an invented value — Stage
  // 4.5 §2: "никогда не придумывать физические данные." A Green Lot with
  // none of these set is still a valid, real anchor row.
  purchasedKg?: number | null;
  purchaseDate?: string | null;
  contractReference?: string;
  notes?: string;
}

export async function createGreenLot(input: CreateGreenLotInput): Promise<CanonicalGreenLot> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('green_lots')
    .insert({
      coffee_id: input.coffeeId,
      roaster_id: input.roasterId,
      purchased_kg: input.purchasedKg ?? null,
      purchase_date: input.purchaseDate ?? null,
      contract_reference: input.contractReference ?? '',
      notes: input.notes ?? '',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to create green lot: ${error?.message ?? 'unknown error'}`);
  return rowToGreenLot(data as GreenLotRow);
}

export interface CreateCanonicalLotInput {
  roasterUuid: string;
  roasterSlug: string; // for generatePublicLotId's ROASTER code segment
  country: string; // for generatePublicLotId's COUNTRY code segment
  greenLotId: string;
  name: string;
  descriptors?: string[];
  qGrade?: number | null;
  roastType?: string;
  roastProfileLabel?: string;
  status?: LotStatus; // defaults to 'draft' — a freshly created Lot has no finalized profile yet
  inRoasterCatalog?: boolean;
}

// Generates the public_id server-side against the REAL, complete set of
// existing ids (not a per-browser guess — this is exactly the bug fixed in
// scripts/migrate-canonical-lot.ts's backfill lookup, applied here to the
// live create path instead). Uses the same tested generatePublicLotId()
// the backfill script also uses.
export async function createCanonicalLot(input: CreateCanonicalLotInput): Promise<CanonicalLot> {
  const supabase = getBrowserSupabaseClient();

  const { data: existingRows, error: existingError } = await supabase.from('lots').select('public_id');
  if (existingError) {
    throw new Error(`Failed to load existing public_ids before generating a new one: ${existingError.message}`);
  }
  const existingPublicIds = new Set((existingRows ?? []).map((row) => row.public_id));
  const publicId = generatePublicLotId(input.roasterSlug, input.country, existingPublicIds);

  const { data, error } = await supabase
    .from('lots')
    .insert({
      public_id: publicId,
      roaster_id: input.roasterUuid,
      green_lot_id: input.greenLotId,
      name: input.name,
      descriptors: input.descriptors ?? [],
      q_grade: input.qGrade ?? null,
      roast_type: input.roastType ?? '',
      roast_profile_label: input.roastProfileLabel ?? '',
      status: input.status ?? 'draft',
      in_roaster_catalog: input.inRoasterCatalog ?? true,
      legacy_text_id: null, // this Lot was never a pre-migration text id
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to create lot: ${error?.message ?? 'unknown error'}`);
  return rowToCanonicalLot(data as LotRow);
}

// Stage 4.5 §6 — mutable Lot fields only. The Pick<> below is enforced by
// the type checker, not just this comment: name/status/inRoasterCatalog are
// the entire mutable surface of a canonical Lot. Origin (Coffee/Green Lot),
// taste, and roast data are never touched by this function — changing
// those means creating a new Coffee/Green Lot (a distinct, explicit
// operation) or a new Reference Taste/Roast Profile version (Phase
// 4.5.3/4.5.4), never an UPDATE through here.
export type MutableCanonicalLotFields = Partial<Pick<CanonicalLot, 'name' | 'status' | 'inRoasterCatalog'>>;

export async function updateCanonicalLotFields(lotUuid: string, fields: MutableCanonicalLotFields): Promise<void> {
  if (fields.name === undefined && fields.status === undefined && fields.inRoasterCatalog === undefined) return;

  const patch: Partial<Pick<LotRow, 'name' | 'status' | 'in_roaster_catalog'>> = {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.status !== undefined ? { status: fields.status } : {}),
    ...(fields.inRoasterCatalog !== undefined ? { in_roaster_catalog: fields.inRoasterCatalog } : {}),
  };

  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.from('lots').update(patch).eq('id', lotUuid);
  if (error) throw new Error(`Failed to update lot: ${error.message}`);
}

// Needed by later phases to tell whether a given public-facing Lot (e.g.
// from useLots(), keyed by its public_id) already has a canonical Supabase
// row before deciding how to edit it — a canonical Lot must never be
// written back to localStorage via saveLot() (Stage 4.5 §7).
export async function findCanonicalLotByPublicId(publicId: string): Promise<CanonicalLot | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.from('lots').select('*').eq('public_id', publicId).maybeSingle();
  if (error || !data) return null;
  return rowToCanonicalLot(data as LotRow);
}

// TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md — the write path that needs
// "whatever reference_taste_profiles row is active for this lot right now"
// (checkins.reference_taste_profile_ref, stamped at tasting creation time in
// lib/journey/store.ts) runs on a totally different timeline than the
// roaster's own taste-profile activation flow — a guest's tasting is never
// preceded by the roaster activating a profile in the same flow — so there
// is no id to thread through a reordered pair of writes here. The active
// version simply has to be looked up independently, by lot, at the moment
// a tasting is recorded.
export interface ActiveReferenceTasteProfile {
  id: string;
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
}

export async function getActiveReferenceTasteProfile(lotUuid: string): Promise<ActiveReferenceTasteProfile | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('reference_taste_profiles')
    .select('id, acidity, sweetness, body, bitterness')
    .eq('lot_id', lotUuid)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    acidity: data.acidity,
    sweetness: data.sweetness,
    body: data.body,
    bitterness: data.bitterness,
  };
}

// For TasteComparison's historically-exact pairing: the specific
// reference_taste_profiles version a given checkin's reference_taste_profile_ref
// points to — which may be `superseded` by the time it's read, unlike
// getActiveReferenceTasteProfile above, which only ever finds the current
// one. Same not-found-returns-null contract, same fields, by id instead of
// by (lot_id, status = 'active').
export async function getReferenceTasteProfileById(
  id: string
): Promise<Omit<ActiveReferenceTasteProfile, 'id'> | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('reference_taste_profiles')
    .select('acidity, sweetness, body, bitterness')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    acidity: data.acidity,
    sweetness: data.sweetness,
    body: data.body,
    bitterness: data.bitterness,
  };
}
