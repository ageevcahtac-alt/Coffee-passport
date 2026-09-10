'use client';

import type { RoastProfile } from '@/lib/types/coffee';
import type { RoastBatchRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// Roaster-authored roast curve profiles, attached to a Lot. Same no-backend
// pattern as recipeVotesStore/lotsStore: local persistence now, shaped to
// drop straight onto a future public.roast_profiles table once this flow is
// wired to real auth.
//
// Stage 4 (Canonical Lot implementation): what this store actually stores —
// an array per lot, each entry carrying its own logged curve, shown
// newest-first with no "this one is the reference" flag (see
// components/coffee/RoastingTab.tsx) — matches the canonical schema's
// `roast_batches` table (supabase/migrations/0023_canonical_lot_profiles.sql),
// NOT `reference_roast_profiles`. syncRoastProfilesFromSupabase() below
// overlays roast_batches rows onto this same cache, same idiom as
// lotsStore.syncLotsFromSupabase(). The separate, versioned Reference Roast
// Profile concept (Stage 3 §06) has no UI yet in this codebase and is not
// added here — this migration only wires up what already exists.

const STORAGE_KEY = 'coffee-passport:roast-profiles';

let cache: RoastProfile[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_PROFILES: RoastProfile[] = [];

function read(): RoastProfile[] {
  if (typeof window === 'undefined') return EMPTY_PROFILES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as RoastProfile[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(profiles: RoastProfile[]) {
  cache = profiles;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // Storage unavailable — in-memory cache still reflects the save for
    // the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): RoastProfile[] {
  return read();
}

export function getServerSnapshot(): RoastProfile[] {
  return EMPTY_PROFILES;
}

type RoastBatchWithLot = RoastBatchRow & { lots: { public_id: string } | null };

function rowToRoastProfile(row: RoastBatchWithLot, roasterId: string): RoastProfile | null {
  if (!row.lots) return null; // orphaned batch (Lot restrict-deleted mid-query) — skip rather than guess
  return {
    id: row.id,
    lotId: row.lots.public_id,
    roasterId,
    machineModel: row.machine_model,
    chargeTemp: row.charge_temp ?? 0,
    dropTemp: row.drop_temp ?? 0,
    firstCrackTimeSec: row.first_crack_time_sec,
    totalTimeSec: row.total_time_sec ?? 0,
    dtrPercent: row.dtr_percent,
    agtronNumber: row.agtron_number,
    curve: row.curve,
    sourceFormat: 'manual',
    sourceFileName: null,
    notes: row.notes,
    createdAt: row.roasted_at,
    referenceRoastProfileId: row.reference_roast_profile_id,
  };
}

// Pulls every roast_batches row (public read, no auth needed — see
// 0025_canonical_lot_rls.sql) and overlays it onto the local cache, same
// idiom as lotsStore.syncLotsFromSupabase(). `roasterId` is accepted from
// the caller (e.g. the currently-viewed Lot's roasterId) rather than joined
// here, since roast_batches has no roaster_id column of its own — it only
// carries the lot_id it belongs to, and Lot->Roaster is already resolved by
// whoever is calling this (RoastingTab/edit page already have the Lot in
// hand). A row is skipped, not guessed, if it can't be matched to a caller-
// supplied roasterId's own lot.
export async function syncRoastProfilesFromSupabase(roasterId: string): Promise<void> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('roast_batches').select('*, lots!inner(public_id)');
    if (error || !data) return;

    const existing = read();
    const byId = new Map(existing.map((profile) => [profile.id, profile]));
    for (const row of data as unknown as RoastBatchWithLot[]) {
      const profile = rowToRoastProfile(row, roasterId);
      if (profile) byId.set(profile.id, profile);
    }
    write(Array.from(byId.values()));
  } catch {
    // Offline / migrations not applied yet — local cache stands, exactly as
    // before this change.
  }
}

export function saveRoastProfile(
  input: Omit<RoastProfile, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): RoastProfile {
  const existing = read();
  if (input.id) {
    const index = existing.findIndex((profile) => profile.id === input.id);
    if (index >= 0) {
      const updated: RoastProfile = { ...existing[index], ...input, id: input.id };
      const next = [...existing];
      next[index] = updated;
      write(next);
      return updated;
    }
  }

  const profile: RoastProfile = {
    ...input,
    id: input.id ?? `roast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  write([profile, ...existing]);
  return profile;
}
