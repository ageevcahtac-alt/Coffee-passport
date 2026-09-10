'use client';

import type { SensoryTagId, TastingRecord } from '@/lib/types/coffee';
import type { CheckinCommunityViewRow, CheckinRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';
import { findCanonicalLotByPublicId, getActiveReferenceTasteProfile } from '@/lib/data/canonicalLotStore';

// localStorage is now a read cache, not the source of truth: syncCheckins-
// ForUser() below pulls the signed-in user's own rows from Supabase's
// public.checkins table (see supabase/migrations/0005_recipes_equipment_checkins.sql)
// on login, and addTastingRecord() writes through on every save,
// best-effort — a failed write (offline, or browsing without an account)
// still lands locally so the app keeps working, it just won't show up on
// another device until the account is signed in and reachable again.

const STORAGE_KEY = 'coffee-passport:journey';
export const DEMO_USER_ID = 'demo-user';

// useSyncExternalStore requires getServerSnapshot to return a referentially
// stable value — a fresh `[]` literal on every call trips React's "should be
// cached to avoid an infinite loop" warning, so both the SSR branch of
// read() and getServerSnapshot() share this one instance.
const EMPTY_RECORDS: TastingRecord[] = [];

let cache: TastingRecord[] | null = null;
const listeners = new Set<() => void>();

// TastingRecord has grown fields since this store's earliest deploys (e.g.
// guestFlavorProfile, added for blind-cupping comparisons) — a browser that
// saved records before that still has old-shaped JSON in localStorage.
// Backfilling missing fields here, once, at the read boundary means every
// consumer (roaster analytics, TasteComparison, etc.) can trust the
// TastingRecord type instead of each one re-guessing a fallback.
function normalizeRecord(record: TastingRecord): TastingRecord {
  return {
    ...record,
    guestFlavorProfile: record.guestFlavorProfile ?? { acidity: 0, sweetness: 0, body: 0, bitterness: 0 },
    // Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md) — this was
    // missing from the backfill even though subDescriptors right below it
    // already got one; a record saved before sensoryTags existed had
    // `undefined` here, which getGuestDescriptorWords (a new consumer that
    // iterates it directly) would throw on. Same fallback shape as every
    // other array field in this function.
    sensoryTags: record.sensoryTags ?? [],
    subDescriptors: record.subDescriptors ?? {},
    bodyTexture: record.bodyTexture ?? null,
    defects: record.defects ?? [],
    drinkCategory: record.drinkCategory ?? '',
    drinkType: record.drinkType ?? '',
    customDrinkName: record.customDrinkName ?? '',
    milkBaseType: record.milkBaseType ?? null,
    cowMilkType: record.cowMilkType ?? null,
    isLactoseFree: record.isLactoseFree ?? false,
    fatContentPercent: record.fatContentPercent ?? null,
    plantMilkType: record.plantMilkType ?? null,
    milkBalance: record.milkBalance ?? null,
    coffeeReadability: record.coffeeReadability ?? null,
    creaminess: record.creaminess ?? null,
    aftertaste: record.aftertaste ?? null,
    isPublic: record.isPublic ?? false,
    referenceTasteProfileId: record.referenceTasteProfileId ?? null,
  };
}

function read(): TastingRecord[] {
  if (typeof window === 'undefined') return EMPTY_RECORDS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TastingRecord[]) : [];
    cache = parsed.map(normalizeRecord);
  } catch {
    cache = [];
  }
  return cache;
}

function write(records: TastingRecord[]) {
  cache = records;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable (private mode, quota) — keep the in-memory cache
    // so the current session still works, just without persistence.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): TastingRecord[] {
  return read();
}

export function getServerSnapshot(): TastingRecord[] {
  return EMPTY_RECORDS;
}

// Exported for lib/data/cafeShopCheckins.ts, which maps the same CheckinRow
// shape for staff dashboards reading a whole shop's checkins (not just the
// signed-in user's own, which is all this store itself ever holds).
export function rowToRecord(row: CheckinRow): TastingRecord {
  return {
    id: row.id,
    userId: row.owner_user_id,
    lotId: row.lot_id,
    roasterId: row.roaster_id,
    coffeeShopId: row.coffee_shop_id,
    brewingMethod: row.brewing_method as TastingRecord['brewingMethod'],
    rating: row.rating,
    sensoryTags: (row.sensory_tags ?? []) as TastingRecord['sensoryTags'],
    subDescriptors: (row.sub_descriptors ?? {}) as TastingRecord['subDescriptors'],
    bodyTexture: row.body_texture as TastingRecord['bodyTexture'],
    defects: (row.defects ?? []) as TastingRecord['defects'],
    liked: row.liked,
    disliked: row.disliked,
    note: row.note,
    baristaId: row.barista_id,
    baristaRating: row.barista_rating,
    baristaNote: row.barista_note,
    guestFlavorProfile: {
      acidity: row.acidity,
      sweetness: row.sweetness,
      body: row.body,
      bitterness: row.bitterness,
    },
    drinkCategory: (row.drink_category ?? '') as TastingRecord['drinkCategory'],
    drinkType: row.drink_type ?? '',
    customDrinkName: row.custom_drink_name ?? '',
    milkBaseType: (row.milk_base_type ?? null) as TastingRecord['milkBaseType'],
    cowMilkType: (row.cow_milk_type ?? null) as TastingRecord['cowMilkType'],
    isLactoseFree: row.is_lactose_free ?? false,
    fatContentPercent: row.fat_content_percent ?? null,
    plantMilkType: row.plant_milk_type ?? null,
    milkBalance: row.milk_balance ?? null,
    coffeeReadability: row.coffee_readability ?? null,
    creaminess: row.creaminess ?? null,
    aftertaste: row.aftertaste ?? null,
    isPublic: row.is_public ?? false,
    createdAt: row.created_at,
    referenceTasteProfileId: row.reference_taste_profile_ref ?? null,
  };
}

// Exported for lib/journey/store.test.ts's direct mapping assertions —
// otherwise module-private, same convention as rowToRecord above.
export function recordToRow(record: TastingRecord): CheckinRow {
  return {
    id: record.id,
    owner_user_id: record.userId,
    lot_id: record.lotId,
    roaster_id: record.roasterId,
    coffee_shop_id: record.coffeeShopId,
    brewing_method: record.brewingMethod,
    rating: record.rating,
    acidity: record.guestFlavorProfile.acidity,
    sweetness: record.guestFlavorProfile.sweetness,
    body: record.guestFlavorProfile.body,
    bitterness: record.guestFlavorProfile.bitterness,
    body_texture: record.bodyTexture,
    sensory_tags: record.sensoryTags,
    sub_descriptors: record.subDescriptors,
    defects: record.defects,
    liked: record.liked,
    disliked: record.disliked,
    note: record.note,
    barista_id: record.baristaId,
    barista_rating: record.baristaRating,
    barista_note: record.baristaNote,
    drink_category: record.drinkCategory,
    drink_type: record.drinkType,
    custom_drink_name: record.customDrinkName,
    milk_base_type: record.milkBaseType,
    cow_milk_type: record.cowMilkType,
    is_lactose_free: record.isLactoseFree,
    fat_content_percent: record.fatContentPercent,
    plant_milk_type: record.plantMilkType,
    milk_balance: record.milkBalance,
    coffee_readability: record.coffeeReadability,
    creaminess: record.creaminess,
    aftertaste: record.aftertaste,
    is_public: record.isPublic,
    created_at: record.createdAt,
    reference_taste_profile_ref: record.referenceTasteProfileId ?? null,
  };
}

function mergeById(local: TastingRecord[], incoming: TastingRecord[]): TastingRecord[] {
  const map = new Map(local.map((record) => [record.id, record]));
  for (const record of incoming) map.set(record.id, record);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Pulls this signed-in user's own checkins from Supabase and overlays them
// onto the local cache. A guest's own full checkin record still has no
// public tier (unlike recipes) — only ever meaningful for a real account,
// so this is a no-op for anonymous browsing (nothing to pull, and
// owner_user_id is a uuid column an anonymous device id wouldn't cast into
// anyway). getCommunityTastingsForLot below is the separate, narrow
// exception: an explicitly opted-in SUBSET of fields, anonymized, readable
// by anyone — see COMMUNITY_LAYER_PRODUCT_AUDIT.md.
export async function syncCheckinsForUser(userId: string, isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('checkins').select('*').eq('owner_user_id', userId);
    if (error) {
      // Previously swallowed silently — same failure classes addTastingRecord
      // already logs on write (offline, table not migrated, RLS reject), but
      // going unlogged here made "why isn't my history loading" undiagnosable
      // from the browser console.
      console.warn('[checkins] Supabase fetch failed, local cache stands:', error.message);
      return;
    }
    if (!data) return;
    write(mergeById(read(), (data as CheckinRow[]).map(rowToRecord)));
  } catch (err) {
    console.warn('[checkins] Supabase fetch threw, local cache stands:', err);
  }
}

// TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md — resolves whichever
// reference_taste_profiles row is `active` for this lot AT THIS EXACT
// MOMENT, so it can be captured once on the tasting and never
// recomputed later. `record.lotId` is the same public_id every other
// canonical lookup on a local Lot uses (see findCanonicalLotByPublicId's
// other call sites) — not the canonical lots.id uuid — so resolving the
// canonical row is the required first step, exactly as
// lib/data/cafeMenuStore.ts's addLotToMenu already does for lot_ref.
// Best-effort and non-blocking by design: a Lot with no canonical row yet,
// no active taste profile yet, or an offline lookup, simply leaves the
// reference null — identical to every tasting recorded before this existed.
async function resolveActiveTasteProfileId(lotId: string): Promise<string | null> {
  try {
    const canonicalLot = await findCanonicalLotByPublicId(lotId);
    if (!canonicalLot) return null;
    const profile = await getActiveReferenceTasteProfile(canonicalLot.id);
    return profile?.id ?? null;
  } catch {
    return null;
  }
}

export function addTastingRecord(
  input: Omit<TastingRecord, 'id' | 'userId' | 'createdAt'>,
  userId: string
): TastingRecord {
  const record: TastingRecord = {
    ...input,
    id: generateId(),
    userId,
    createdAt: new Date().toISOString(),
  };
  write([record, ...read()]);

  // The reference lookup runs before the Supabase insert (not after, and
  // not as a separate update) so the checkin never exists server-side even
  // momentarily without its historical link — see Step 1 of
  // TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md. This only delays the
  // best-effort remote write by one extra round trip; the local save above
  // already completed synchronously and is what the UI actually waits on.
  void resolveActiveTasteProfileId(record.lotId)
    .then((referenceTasteProfileId) => {
      // Merge into whatever the CURRENT local record looks like (not the
      // `record` snapshot closed over above) — a fast anonymous-to-signup
      // claim can re-tag this same id's userId before this lookup resolves,
      // and reference lookup must never clobber that re-tagging.
      let withReference: TastingRecord = { ...record, referenceTasteProfileId };
      write(
        read().map((r) => {
          if (r.id !== record.id) return r;
          withReference = { ...r, referenceTasteProfileId };
          return withReference;
        })
      );
      return getBrowserSupabaseClient().from('checkins').insert(recordToRow(withReference));
    })
    .then((result) => {
      if (result?.error) {
        console.warn('[checkins] Supabase write failed, kept local-only:', result.error.message);
      }
    });

  return record;
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's own tasting
// history so it can't leak into the next account's view of this shared
// local store. Goes through write() (not a raw localStorage overwrite) so
// this store's own in-memory cache and useSyncExternalStore subscribers
// stay consistent regardless of call order.
export function purgeRecordsForUser(userId: string): void {
  write(read().filter((record) => record.userId !== userId));
}

// GAP 2 (IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md) — called once, right
// after a guest authenticates for the first time on THIS device (see
// lib/auth/currentUser.tsx), so their pre-signup anonymous tastings don't
// silently vanish from their own history the moment currentUserId stops
// matching the anonymous id that created them.
//
// Ownership proof, precisely: `anonUserId` is read from this exact device's
// own ANON_ID_KEY, immediately before the caller authenticated — the same
// id every anonymous read/write on this browser has used all along. This
// is not a cross-user or cross-device operation: it only ever touches
// records already sitting in THIS browser's own local cache, tagged with
// THIS browser's own anonymous id. No other user's data is reachable from
// here (an anonymous checkin can never have reached Supabase in the first
// place — owner_user_id references auth.users(id), which no anonymous id
// can satisfy — so there is nothing server-side to UPDATE, only local
// records to re-own and then insert for the first time).
//
// Re-tagging is destructive (userId is changed in place, records are never
// duplicated), which makes this naturally idempotent and self-limiting: once
// a record is re-tagged to a real account, nothing is left under the old
// anonymous id for a second call — or a second, different account signing
// into this same device later — to find. isPublic is carried through
// completely unchanged: signing up never flips a private tasting to public,
// and never touches an already-opted-in one either way.
export async function claimAnonymousTastings(anonUserId: string, realUserId: string): Promise<void> {
  const existing = read();
  const claimed = existing.filter((record) => record.userId === anonUserId);
  if (claimed.length === 0) return;

  const reowned = claimed.map((record) => ({ ...record, userId: realUserId }));
  write(existing.map((record) => (record.userId === anonUserId ? { ...record, userId: realUserId } : record)));

  // Best-effort, same convention as addTastingRecord's own Supabase write:
  // the local re-tag above already fixed this device's own view regardless
  // of whether this insert succeeds — a failure here just means these
  // tastings won't show up on another device yet, not that they're lost.
  try {
    const { error } = await getBrowserSupabaseClient().from('checkins').insert(reowned.map(recordToRow));
    if (error) {
      console.warn('[checkins] Failed to sync claimed anonymous tastings, kept local-only:', error.message);
    }
  } catch (err) {
    console.warn('[checkins] Claiming anonymous tastings threw, kept local-only:', err);
  }
}

// A community-shared tasting, as returned by public.checkins_community_view
// (see 0026_checkins_community_sharing.sql) — deliberately narrower than
// TastingRecord: no id/owner/shop/barista fields exist on the view at all,
// only what's meaningful to "how did the community perceive this coffee's
// taste." Anonymous by construction — see the migration's own comment for
// why there is no author identity to attach.
export interface CommunityTasting {
  rating: number;
  guestFlavorProfile: { acidity: number; sweetness: number; body: number; bitterness: number };
  brewingMethod: string;
  liked: string;
  disliked: string;
  note: string;
  createdAt: string;
  // Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md) — added
  // alongside 0031_checkins_community_sensory_tags.sql so community
  // aggregation can work with real descriptor words. Defaults to an empty
  // array (not undefined) for a Supabase project that hasn't applied 0031
  // yet, so every reader can treat "no tags" and "old view shape" the same
  // way without a special case.
  sensoryTags: SensoryTagId[];
}

function rowToCommunityTasting(row: CheckinCommunityViewRow): CommunityTasting {
  return {
    rating: row.rating,
    guestFlavorProfile: {
      acidity: row.acidity,
      sweetness: row.sweetness,
      body: row.body,
      bitterness: row.bitterness,
    },
    brewingMethod: row.brewing_method,
    liked: row.liked,
    disliked: row.disliked,
    note: row.note,
    createdAt: row.created_at,
    sensoryTags: (row.sensory_tags ?? []) as SensoryTagId[],
  };
}

// Public, no sign-in required to read (same tier as public recipes) — see
// the view's own grant. Newest first, capped the same way every other
// "recent activity" feed in this app is (see CommunityHighlights.tsx's
// FEED_LIMIT) rather than paginating a list that's expected to stay short.
const COMMUNITY_TASTINGS_LIMIT = 5;

export async function getCommunityTastingsForLot(lotId: string): Promise<CommunityTasting[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('checkins_community_view')
      .select('*')
      .eq('lot_id', lotId)
      .order('created_at', { ascending: false })
      .limit(COMMUNITY_TASTINGS_LIMIT);
    if (error || !data) return [];
    return (data as CheckinCommunityViewRow[]).map(rowToCommunityTasting);
  } catch {
    return [];
  }
}
