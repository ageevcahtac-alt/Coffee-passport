'use client';

import type { CoffeeRow, GreenLotRow, LotRow, LotStatus } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generatePublicLotId, planVersionActivation, type VersionedProfileRow } from '@/lib/server/canonicalLot';

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

// Shared one-line summaries for a Coffee/Green Lot, used anywhere the chain
// needs to be shown to a roaster (the creation wizard's origin-summary card,
// and Phase 4.5.3's read/detail view) — kept here, not duplicated per page,
// so the two surfaces can never describe the same row differently.
export function describeCanonicalCoffee(coffee: CanonicalCoffee): string {
  return [coffee.country, coffee.region, coffee.farm || coffee.producer].filter(Boolean).join(' · ') || 'Кофе без описания';
}

export function describeCanonicalGreenLot(greenLot: CanonicalGreenLot): string {
  const parts: string[] = [];
  if (greenLot.purchaseDate) parts.push(greenLot.purchaseDate);
  if (greenLot.purchasedKg != null) parts.push(`${greenLot.purchasedKg} кг`);
  if (greenLot.contractReference) parts.push(greenLot.contractReference);
  return parts.length > 0 ? parts.join(' · ') : 'Партия без деталей';
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

// For the Canonical Lot detail view (Phase 4.5.3) — resolves a Green Lot's
// parent Coffee, or a Lot's grandparent Coffee via its Green Lot. Returns
// null on any not-found/error rather than throwing, since a detail page
// showing a partial chain (e.g. Coffee failed to load) is more useful than
// one that crashes the whole page.
export async function getCoffeeById(coffeeId: string): Promise<CanonicalCoffee | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.from('coffees').select('*').eq('id', coffeeId).maybeSingle();
  if (error || !data) return null;
  return rowToCoffee(data as CoffeeRow);
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

// For Café-ordering gating (Phase 4.5.6) — status per public_id, across
// every roaster at once. The café add-lot flow browses every roaster's
// catalog in one list (unlike the roaster's own dashboard, it has no single
// roaster_id to scope by), so this is deliberately unscoped — the same
// shape createCanonicalLot() already uses for its own public_id-uniqueness
// check (a bare `select` over all of `lots`), just also returning status.
export async function listAllCanonicalLotStatuses(): Promise<Map<string, LotStatus>> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.from('lots').select('public_id, status');
  if (error || !data) throw new Error(`Failed to load lot statuses: ${error?.message ?? 'unknown error'}`);
  return new Map(data.map((row) => [row.public_id, row.status]));
}

// For the Roaster Catalog list (Phase 4.5.5) — every Canonical Lot this
// roaster owns, so the dashboard can show `status` (draft/testing/active/
// archived) per Lot instead of that field being visible only on the detail/
// edit surfaces (Phase 4.5.3/4.5.4). Mirrors listCoffeesForRoaster's exact
// shape/ordering; read-only, no effect on any other surface's gating.
export async function listCanonicalLotsForRoaster(roasterUuid: string): Promise<CanonicalLot[]> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('lots')
    .select('*')
    .eq('roaster_id', roasterUuid)
    .order('created_at', { ascending: false });
  if (error || !data) throw new Error(`Failed to load lots for roaster: ${error?.message ?? 'unknown error'}`);
  return (data as LotRow[]).map(rowToCanonicalLot);
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

// COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md — closes the "no edit path
// exists for Coffee, for anyone" gap (NEXT_ARCHITECTURE_AUDIT.md §3.1,
// COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md, COFFEE_PASSPORT_END_TO_END_ARCHITECTURE_AUDIT.md
// finding #2). Mirrors updateCanonicalLotFields's own shape exactly: a
// partial patch, RLS-gated by the same "roaster staff manage own coffees"
// policy createCoffee already runs under (`is_roaster_staff_for(roaster_id)`)
// — no RLS change was needed or made. Never touches `id`/`roaster_id`
// (Coffee's own identity/ownership), and has no parameter that could touch
// `green_lots`/`lots` — editing a Coffee can only ever change Coffee's own
// row, never cascade into any Green Lot or Canonical Lot built on it.
export type MutableCoffeeFields = Partial<
  Pick<CanonicalCoffee, 'country' | 'region' | 'farm' | 'producer' | 'variety' | 'altitude' | 'processing' | 'harvestYear'>
>;

export async function updateCoffee(coffeeId: string, fields: MutableCoffeeFields): Promise<void> {
  const patch: Partial<
    Pick<CoffeeRow, 'country' | 'region' | 'farm' | 'producer' | 'variety' | 'altitude' | 'processing' | 'harvest_year'>
  > = {
    ...(fields.country !== undefined ? { country: fields.country } : {}),
    ...(fields.region !== undefined ? { region: fields.region } : {}),
    ...(fields.farm !== undefined ? { farm: fields.farm } : {}),
    ...(fields.producer !== undefined ? { producer: fields.producer } : {}),
    ...(fields.variety !== undefined ? { variety: fields.variety } : {}),
    ...(fields.altitude !== undefined ? { altitude: fields.altitude } : {}),
    ...(fields.processing !== undefined ? { processing: fields.processing } : {}),
    ...(fields.harvestYear !== undefined ? { harvest_year: fields.harvestYear } : {}),
  };
  if (Object.keys(patch).length === 0) return;

  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.from('coffees').update(patch).eq('id', coffeeId);
  if (error) throw new Error(`Failed to update coffee: ${error.message}`);
}

// For the Canonical Lot detail view (Phase 4.5.3) — resolves a Lot's parent
// Green Lot. Same not-found-returns-null contract as getCoffeeById above.
export async function getGreenLotById(greenLotId: string): Promise<CanonicalGreenLot | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.from('green_lots').select('*').eq('id', greenLotId).maybeSingle();
  if (error || !data) return null;
  return rowToGreenLot(data as GreenLotRow);
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

// COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md — closes the "no edit path
// exists for Green Lot, for anyone" gap (same citations as updateCoffee
// above). Same shape, same RLS policy already in force
// ("roaster staff manage own green lots", is_roaster_staff_for(roaster_id)).
// Deliberately excludes `coffee_id`/`roaster_id` — a Green Lot's parent
// Coffee is immutable by construction, exactly like a Canonical Lot's
// parent Green Lot (MutableCanonicalLotFields's own comment) — editing a
// Green Lot's own purchase/notes fields can never re-parent it to a
// different Coffee, and never touches `lots` at all.
export type MutableGreenLotFields = Partial<
  Pick<CanonicalGreenLot, 'purchasedKg' | 'purchaseDate' | 'contractReference' | 'notes'>
>;

export async function updateGreenLot(greenLotId: string, fields: MutableGreenLotFields): Promise<void> {
  const patch: Partial<Pick<GreenLotRow, 'purchased_kg' | 'purchase_date' | 'contract_reference' | 'notes'>> = {
    ...(fields.purchasedKg !== undefined ? { purchased_kg: fields.purchasedKg } : {}),
    ...(fields.purchaseDate !== undefined ? { purchase_date: fields.purchaseDate } : {}),
    ...(fields.contractReference !== undefined ? { contract_reference: fields.contractReference } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
  };
  if (Object.keys(patch).length === 0) return;

  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.from('green_lots').update(patch).eq('id', greenLotId);
  if (error) throw new Error(`Failed to update green lot: ${error.message}`);
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

// Mutable Lot fields — widened in Phase 4.5.12's final architecture audit.
// Origin (Coffee/Green Lot) and versioned reference taste/roast profile data
// (a separate, superseding-version mechanism — see planVersionActivation in
// lib/server/canonicalLot.ts, not yet wired to any write path at all) remain
// permanently out of scope for this function: changing those means creating
// a new Coffee/Green Lot or a new Reference Taste/Roast Profile version, a
// distinct, explicit operation, never a plain UPDATE through here.
//
// name/status/inRoasterCatalog were the original (Stage 4.5 §6) mutable
// surface. qGrade/roastType/roastProfileLabel/descriptors are added here
// because the audit found a real gap, not because the model needed
// widening for its own sake: LotBuilderForm has always let a roaster freely
// edit all four on the edit screen (they are not Coffee/Green-Lot fields —
// see PHASE_4.5.9_REPORT.md's field-ownership table, they're plain columns
// on `lots` itself), but only name/inRoasterCatalog were ever synced back —
// editing, say, a Q-Score after cupping silently only updated the local
// browser's own cache, never Supabase, so every other reader (a different
// browser, a guest's Public Passport, a café) kept showing the value from
// creation time forever. That divergence is exactly what this function
// exists to prevent for the fields it does cover.
export type MutableCanonicalLotFields = Partial<
  Pick<CanonicalLot, 'name' | 'status' | 'inRoasterCatalog' | 'qGrade' | 'roastType' | 'roastProfileLabel' | 'descriptors'>
>;

export async function updateCanonicalLotFields(lotUuid: string, fields: MutableCanonicalLotFields): Promise<void> {
  const patch: Partial<
    Pick<LotRow, 'name' | 'status' | 'in_roaster_catalog' | 'q_grade' | 'roast_type' | 'roast_profile_label' | 'descriptors'>
  > = {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.status !== undefined ? { status: fields.status } : {}),
    ...(fields.inRoasterCatalog !== undefined ? { in_roaster_catalog: fields.inRoasterCatalog } : {}),
    ...(fields.qGrade !== undefined ? { q_grade: fields.qGrade } : {}),
    ...(fields.roastType !== undefined ? { roast_type: fields.roastType } : {}),
    ...(fields.roastProfileLabel !== undefined ? { roast_profile_label: fields.roastProfileLabel } : {}),
    ...(fields.descriptors !== undefined ? { descriptors: fields.descriptors } : {}),
  };
  if (Object.keys(patch).length === 0) return;

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

// For the Canonical Lot detail view (Phase 4.5.3) — every other Lot that
// shares this Green Lot, so the "one Green Lot -> many Canonical Lots" reuse
// (Scenario D) is visible on the page, not just true in the schema. Newest
// first, same ordering convention as listGreenLotsForCoffee.
export async function listCanonicalLotsForGreenLot(greenLotId: string): Promise<CanonicalLot[]> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('lots')
    .select('*')
    .eq('green_lot_id', greenLotId)
    .order('created_at', { ascending: false });
  if (error || !data) throw new Error(`Failed to load lots for green lot: ${error?.message ?? 'unknown error'}`);
  return (data as LotRow[]).map(rowToCanonicalLot);
}

// =========================================================
// Reference Taste Profile — completes a write path that had existed only as
// pure, tested logic (planVersionActivation, lib/server/canonicalLot.ts)
// since Phase 4.5.1, never wired to any UI. Before this, the only writer of
// `reference_taste_profiles` in the entire codebase was the one-time backfill
// script (scripts/migrate-canonical-lot.ts) — every Lot created through the
// live app since then had no `active` row at all, so lib/data/lotsStore.ts's
// rowToLot() fell through to its own read-side fallback: for any guest whose
// browser has no local override for that Lot (i.e. every guest who isn't the
// roaster's own browser), that fallback is a flat { acidity: 0, sweetness: 0,
// body: 0, bitterness: 0 } — rendered with full confidence as "Эталон
// обжарщика" in the app's signature blind-tasting reveal/comparison
// (components/coffee/TasteComparison.tsx, ProducerRoasterCard.tsx). See
// PUBLIC_PASSPORT_NEXT_BLOCK_AUDIT.md for the full evidence trail.
// =========================================================

export interface ReferenceTasteProfileValues {
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
}

// Activates a new Reference Taste Profile version for a Canonical Lot.
// Two-step write, per Stage 3 §07/§25's own rule (already enforced by
// planVersionActivation's contract): the previously-active version, if any,
// is superseded — never rewritten — and the new version is inserted fresh
// as `active`. Never touches Coffee, Green Lot, or the Lot's own row in
// `lots` — this is a distinct table, versioned independently of the Lot's
// own `status` lifecycle.
export async function activateTasteProfile(lotUuid: string, values: ReferenceTasteProfileValues): Promise<void> {
  const supabase = getBrowserSupabaseClient();

  const { data: existingRows, error: existingError } = await supabase
    .from('reference_taste_profiles')
    .select('id, version, status')
    .eq('lot_id', lotUuid);
  if (existingError) {
    throw new Error(`Failed to load existing taste profile versions: ${existingError.message}`);
  }

  const { supersedeId, nextVersion } = planVersionActivation((existingRows ?? []) as VersionedProfileRow[]);

  if (supersedeId) {
    const { error: supersedeError } = await supabase
      .from('reference_taste_profiles')
      .update({ status: 'superseded' })
      .eq('id', supersedeId);
    if (supersedeError) {
      throw new Error(`Failed to supersede previous taste profile version: ${supersedeError.message}`);
    }
  }

  const { error: insertError } = await supabase.from('reference_taste_profiles').insert({
    lot_id: lotUuid,
    version: nextVersion,
    status: 'active',
    acidity: values.acidity,
    sweetness: values.sweetness,
    body: values.body,
    bitterness: values.bitterness,
    effective_from: new Date().toISOString(),
    created_by: null,
  });
  if (insertError) {
    throw new Error(`Failed to activate new taste profile version: ${insertError.message}`);
  }
}

// =========================================================
// Roast Batch — completes another write path found unwired during the
// Public Coffee Passport block's roast_batches audit
// (ROAST_BATCH_PUBLIC_PASSPORT_AUDIT.md). Every field this function writes
// is already rendered to guests today by components/coffee/
// RoastProfileSummaryCard.tsx and RoastingTab.tsx (both already live,
// already reading `roast_batches` via lib/data/roastProfilesStore.ts's
// syncRoastProfilesFromSupabase — pre-dating this app's Canonical Lot work).
// The roaster's own save button already says "Опубликовать профиль
// обжарки" ("Publish roast profile") and the Agtron field's own label says
// "Показывается гостям" ("Shown to guests") — this was never a decision
// about NEW public exposure, only about connecting an already-decided,
// already-built guest-facing feature to a write path that never existed.
//
// roasted_at/batch_number are deliberately never set to anything
// meaningful here (batch_number stays '', roasted_at is "now") — the client
// RoastProfile type's own comment is explicit that dates/batch numbers are
// "internal record-keeping only; never shown on the guest-facing roast
// profile card, by design." Nothing this function does changes that.
export interface RoastBatchValues {
  machineModel: string;
  chargeTemp: number;
  dropTemp: number;
  firstCrackTimeSec: number | null;
  totalTimeSec: number;
  dtrPercent: number | null;
  agtronNumber: number | null;
  curve: { timeSec: number; bt: number | null; et: number | null; ror: number | null }[];
  notes: string;
  // The exact reference_roast_profiles version this batch followed — see
  // ROAST_BATCH_REFERENCE_LINK.md. Caller-supplied, not defaulted: the
  // caller must explicitly pass the id it just activated (or null, e.g. an
  // early test roast with no finalized reference profile yet), so this
  // immutable log never silently records the wrong version.
  referenceRoastProfileId: string | null;
}

// `roast_batches` rows are immutable once created (a DB trigger rejects any
// UPDATE/DELETE — supabase/migrations/0023_canonical_lot_profiles.sql) — a
// real, deliberate production-log invariant, not incidental. This function
// is therefore insert-only, on purpose: every save — whether the roaster is
// logging a brand-new profile or using the existing "Редактировать" action
// on a previously-published one — creates one new, real, permanent batch
// event rather than attempting to silently rewrite history the schema
// itself refuses to allow.
export async function createRoastBatch(lotUuid: string, values: RoastBatchValues): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.from('roast_batches').insert({
    lot_id: lotUuid,
    reference_roast_profile_id: values.referenceRoastProfileId,
    batch_number: '',
    roasted_at: new Date().toISOString(),
    machine_model: values.machineModel,
    green_kg: null,
    charge_temp: values.chargeTemp,
    drop_temp: values.dropTemp,
    first_crack_time_sec: values.firstCrackTimeSec,
    total_time_sec: values.totalTimeSec,
    dtr_percent: values.dtrPercent,
    agtron_number: values.agtronNumber,
    curve: values.curve,
    notes: values.notes,
    created_by: null,
  });
  if (error) throw new Error(`Failed to log roast batch: ${error.message}`);
}

// =========================================================
// Reference Roast Profile — the roaster's DECLARED target approach for a
// Lot ("Задумка обжарщика"), distinct from `roast_batches` (an immutable
// log of what actually happened at each individual roast — see
// ROAST_BATCH_PUBLIC_PASSPORT_AUDIT.md). Versioned exactly like
// `reference_taste_profiles` (draft/active/superseded, exactly one active
// per Lot enforced by a DB partial unique index) — same shape, same
// planVersionActivation() contract, reused verbatim rather than inventing a
// second versioning pattern. See REFERENCE_ROAST_PROFILE_IMPLEMENTATION.md
// for why the read side (RoastProfileSummaryCard/RoastingTab) is
// deliberately NOT reconnected to this table in this pass: its existing
// rendering expects two endpoint temperatures (chargeTemp/dropTemp, a
// roast_batches-shaped field), not this table's actual shape (a full
// target_curve point array, no chargeTemp/dropTemp columns at all) —
// wiring it in without redesigning that rendering would be incorrect, and
// redesigning it is out of this pass's scope.
// =========================================================

export interface ReferenceRoastProfileValues {
  machineModel: string;
  targetCurve: { timeSec: number; bt: number | null; et: number | null; ror: number | null }[];
  agtronTarget: number | null;
  notes: string;
}

// Activates a new Reference Roast Profile version for a Canonical Lot.
// Same two-step write as activateTasteProfile: the previously-active
// version, if any, is superseded — never rewritten — and the new version is
// inserted fresh as `active`. Never touches `roast_batches` (a separate
// table), Coffee, or Green Lot.
//
// Returns the new version's id (unlike activateTasteProfile, which has no
// caller needing it) — see ROAST_BATCH_REFERENCE_LINK.md: the caller
// (handleRoastProfileSave) must run THIS write first and thread its id into
// the immutable roast_batches row created right after, so that row records
// the EXACT version it followed rather than "whatever is active now."
export async function activateReferenceRoastProfile(
  lotUuid: string,
  values: ReferenceRoastProfileValues
): Promise<string> {
  const supabase = getBrowserSupabaseClient();

  const { data: existingRows, error: existingError } = await supabase
    .from('reference_roast_profiles')
    .select('id, version, status')
    .eq('lot_id', lotUuid);
  if (existingError) {
    throw new Error(`Failed to load existing reference roast profile versions: ${existingError.message}`);
  }

  const { supersedeId, nextVersion } = planVersionActivation((existingRows ?? []) as VersionedProfileRow[]);

  if (supersedeId) {
    const { error: supersedeError } = await supabase
      .from('reference_roast_profiles')
      .update({ status: 'superseded' })
      .eq('id', supersedeId);
    if (supersedeError) {
      throw new Error(`Failed to supersede previous reference roast profile version: ${supersedeError.message}`);
    }
  }

  const { data, error: insertError } = await supabase
    .from('reference_roast_profiles')
    .insert({
      lot_id: lotUuid,
      version: nextVersion,
      status: 'active',
      machine_model: values.machineModel,
      target_curve: values.targetCurve,
      agtron_target: values.agtronTarget,
      notes: values.notes,
      effective_from: new Date().toISOString(),
      created_by: null,
    })
    .select('id')
    .single();
  if (insertError || !data) {
    throw new Error(`Failed to activate new reference roast profile version: ${insertError?.message ?? 'unknown error'}`);
  }
  return data.id;
}

// For the Public Passport "Задумано обжарщиком" card
// (components/coffee/RoastIntentCard.tsx) — the currently-active declared
// target, unambiguous per Lot: the DB's own partial unique index
// (idx_ref_roast_profiles_one_active) guarantees at most one `active` row
// per lot_id, so this can never return more than one candidate. Read-only,
// public (RLS already grants anon select), never falls back to a batch or
// any other row — a Lot with no active reference profile yet simply has
// none, same not-found-returns-null contract as the rest of this file's
// getters.
export interface ActiveReferenceRoastProfile {
  machineModel: string;
  targetCurve: { timeSec: number; bt: number | null; et: number | null; ror: number | null }[];
  agtronTarget: number | null;
  notes: string;
}

export async function getActiveReferenceRoastProfile(lotUuid: string): Promise<ActiveReferenceRoastProfile | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('reference_roast_profiles')
    .select('machine_model, target_curve, agtron_target, notes')
    .eq('lot_id', lotUuid)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return {
    machineModel: data.machine_model,
    targetCurve: data.target_curve,
    agtronTarget: data.agtron_target,
    notes: data.notes,
  };
}

// For the Public Passport's historically-exact pairing (Step 5,
// ROAST_BATCH_REFERENCE_LINK.md): the specific reference_roast_profiles
// version a given roast_batches row's reference_roast_profile_id points to
// — which may be a `superseded` version by the time it's read, unlike
// getActiveReferenceRoastProfile above, which only ever finds the current
// one. Same not-found-returns-null contract, same fields, by id instead of
// by (lot_id, status = 'active').
export async function getReferenceRoastProfileById(id: string): Promise<ActiveReferenceRoastProfile | null> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('reference_roast_profiles')
    .select('machine_model, target_curve, agtron_target, notes')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    machineModel: data.machine_model,
    targetCurve: data.target_curve,
    agtronTarget: data.agtron_target,
    notes: data.notes,
  };
}
