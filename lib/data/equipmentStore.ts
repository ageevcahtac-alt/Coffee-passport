'use client';

import type { EquipmentOwnerKind, EquipmentSetup } from '@/lib/types/coffee';
import type { EquipmentGarageRow, EquipmentGarageUpsert } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// The enthusiast's saved personal setup ("Моё оборудование" — see
// app/(site)/journey/equipment/page.tsx), one record per owner (also
// reused for the pilot roaster/coffee-shop Garages — see
// components/coffee/EquipmentGarage.tsx). localStorage is now a read
// cache, not the source of truth: syncEquipmentFromSupabase() below pulls
// the DB's copy in on mount, and saveEquipment() writes through to
// Supabase's equipment_garage table (see
// supabase/migrations/0005_recipes_equipment_checkins.sql) on every save,
// best-effort — a failed write (offline, or an anonymous enthusiast with
// no real account to sync to) still lands locally so the app keeps
// working, it just won't show up on another device until the account is
// actually signed in and reachable again.

const STORAGE_KEY = 'coffee-passport:equipment';

let cache: EquipmentSetup[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_SETUPS: EquipmentSetup[] = [];

function read(): EquipmentSetup[] {
  if (typeof window === 'undefined') return EMPTY_SETUPS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as EquipmentSetup[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(setups: EquipmentSetup[]) {
  cache = setups;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setups));
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

export function getSnapshot(): EquipmentSetup[] {
  return read();
}

export function getServerSnapshot(): EquipmentSetup[] {
  return EMPTY_SETUPS;
}

export function getEquipmentForUser(userId: string): EquipmentSetup | undefined {
  return read().find((setup) => setup.userId === userId);
}

function rowToSetup(row: EquipmentGarageRow): EquipmentSetup {
  return {
    userId: row.owner_id,
    ownerKind: row.owner_kind,
    espressoGrinder: row.espresso_grinder,
    espressoMachine: row.espresso_machine,
    espressoWater: row.espresso_water,
    filterGrinder: row.filter_grinder,
    filterWater: row.filter_water,
    favoriteDeviceIds: row.favorite_device_ids ?? [],
    updatedAt: row.updated_at,
  };
}

function setupToRow(setup: EquipmentSetup): EquipmentGarageUpsert {
  return {
    owner_kind: setup.ownerKind,
    owner_id: setup.userId,
    owner_user_id: setup.ownerKind === 'enthusiast' ? setup.userId : null,
    espresso_grinder: setup.espressoGrinder,
    espresso_machine: setup.espressoMachine,
    espresso_water: setup.espressoWater,
    filter_grinder: setup.filterGrinder,
    filter_water: setup.filterWater,
    favorite_device_ids: setup.favoriteDeviceIds,
    updated_at: setup.updatedAt,
  };
}

// Pulls this owner's Garage from Supabase and overlays it onto the local
// cache — called on mount by EquipmentGarage.tsx (covers all three
// dedicated Garage pages) and by the recipe forms that auto-fill from it
// (so a recipe form opened without ever visiting the Garage page first
// still sees the synced setup). `owner_id` is a text column, so this is
// always safe to call regardless of whether the caller has a real account
// (an anonymous enthusiast simply won't have a matching row).
export async function syncEquipmentFromSupabase(ownerId: string): Promise<void> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('equipment_garage')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (error || !data) return;
    const setup = rowToSetup(data as EquipmentGarageRow);
    write([...read().filter((existing) => existing.userId !== ownerId), setup]);
  } catch {
    // Offline / table not migrated yet / RLS reject — local cache stands.
  }
}

export function saveEquipment(setup: Omit<EquipmentSetup, 'updatedAt'>): EquipmentSetup {
  const existing = read();
  const index = existing.findIndex((candidate) => candidate.userId === setup.userId);
  const updated: EquipmentSetup = { ...setup, updatedAt: new Date().toISOString() };
  const next = [...existing];
  if (index >= 0) next[index] = updated;
  else next.push(updated);
  write(next);

  void getBrowserSupabaseClient()
    .from('equipment_garage')
    .upsert(setupToRow(updated), { onConflict: 'owner_kind,owner_id' })
    .then(({ error }) => {
      if (error) {
        console.warn('[equipment_garage] Supabase write failed, kept local-only:', error.message);
      }
    });

  return updated;
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's saved Garage setup.
// Only ever removes an *enthusiast* entry in practice: cafe/roaster owner
// ids are fixed pilot ids (ACTIVE_SHOP_ID/ACTIVE_ROASTER_ID), never a
// switching account's userId.
export function purgeEquipmentForUser(userId: string): void {
  write(read().filter((setup) => setup.userId !== userId));
}

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — same gap as
// brewingRecipesStore's claimEnthusiastRecipesForUser (anon writes can
// never satisfy equipment_garage's owner_user_id uuid/RLS, so an
// anonymous Garage stays local-only forever). Equipment is a SINGLETON per
// owner (one row per userId — see saveEquipment's findIndex-by-userId
// replace), so unlike the array-shaped stores this can collide: if the
// authenticated account already has its own Garage entry on this device
// (e.g. synced down from Supabase, or saved earlier this session), blindly
// retagging the anonymous entry on top of it would silently overwrite
// already-owned authenticated data with a possibly-stale anonymous one —
// exactly the destructive-overwrite this task's own spec warns against.
// So this only claims when the account doesn't already have a setup;
// otherwise it leaves the anonymous entry exactly where it is, unclaimed,
// rather than guess which one should win.
export async function claimEquipmentForUser(anonUserId: string, realUserId: string): Promise<void> {
  const existing = read();
  const anonSetup = existing.find((setup) => setup.userId === anonUserId);
  if (!anonSetup) return;
  if (existing.some((setup) => setup.userId === realUserId)) return;

  const claimed: EquipmentSetup = { ...anonSetup, userId: realUserId };
  write(existing.map((setup) => (setup.userId === anonUserId ? claimed : setup)));

  try {
    const { error } = await getBrowserSupabaseClient()
      .from('equipment_garage')
      .upsert(setupToRow(claimed), { onConflict: 'owner_kind,owner_id' });
    if (error) {
      console.warn('[equipment_garage] Failed to sync claimed anonymous equipment, kept local-only:', error.message);
    }
  } catch (err) {
    console.warn('[equipment_garage] Claiming anonymous equipment threw, kept local-only:', err);
  }
}
