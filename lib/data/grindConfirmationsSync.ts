'use client';

// Phase 3 community sync for grind confirmations (0038): the local store
// (lib/data/grindConfirmationsStore.ts) stays the offline source of truth;
// this module mirrors it into Supabase so the conversion hint can lean on
// community medians across devices.
//
// Consent wall — same opt-in rule as checkins (0026/PR #86): the ONLY
// push call site (lib/journey/store.ts, after a consented tasting save)
// passes rows already gated by sharedTastingIsPublic; RLS is the second
// wall (owner_user_id = auth.uid() on insert). Anonymous tastings never
// reach this module at all.
//
// Sync shape mirrors the checkins pattern (syncCheckinsForUser): save-time
// best-effort push with a login-time pull-merge + retry of parked rows.
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import type { GrindConfirmationInsert, GrindConfirmationRow } from '@/lib/types/database';
import {
  getSnapshot,
  mergeServerConfirmation,
  updateSyncState,
  type GrindConfirmation,
} from './grindConfirmationsStore';

function rowToConfirmation(row: GrindConfirmationRow): GrindConfirmation {
  return {
    id: `grindconf-server-${row.id}`,
    fromModel: row.from_model,
    fromSetting: row.from_setting,
    toModel: row.to_model,
    toSetting: row.to_setting,
    brewingMethodId: row.brewing_method,
    createdAt: row.created_at,
    lotId: row.lot_id,
    // Server row already exists — never re-push it.
    serverId: row.id,
  };
}

/**
 * Save-time push for one freshly logged confirmation. Best-effort: on
 * failure (offline, table not migrated yet) the row is parked under
 * syncPendingFor so the next login's sync retries it. The server row's
 * lot_id comes from the local record's lotId echo. Returns whether the row
 * reached the server.
 */
export async function pushGrindConfirmation(confirmation: GrindConfirmation, userId: string): Promise<boolean> {
  try {
    const row: GrindConfirmationInsert = {
      owner_user_id: userId,
      from_model: confirmation.fromModel,
      to_model: confirmation.toModel,
      brewing_method: confirmation.brewingMethodId,
      from_setting: confirmation.fromSetting,
      to_setting: confirmation.toSetting,
      lot_id: confirmation.lotId ?? '',
    };
    const { data, error } = await getBrowserSupabaseClient()
      .from('grind_confirmations')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      console.warn('[grind] Supabase push failed, parked for retry:', error.message);
      updateSyncState(confirmation.id, { syncPendingFor: userId });
      return false;
    }
    updateSyncState(confirmation.id, { serverId: data.id as string, syncPendingFor: null });
    return true;
  } catch (err) {
    console.warn('[grind] Supabase push threw, parked for retry:', err);
    updateSyncState(confirmation.id, { syncPendingFor: userId });
    return false;
  }
}

/**
 * Login-time sync, wired next to syncCheckinsForUser in
 * lib/auth/currentUser.tsx. Two jobs:
 *  1. pull this user's server rows and merge server-only ones into the
 *     local store (dedup by serverId — local stays the offline source);
 *  2. retry rows parked by a failed save-time push (syncPendingFor = user).
 * Anonymous browsing is a no-op, same as the checkins sync.
 */
export async function syncGrindConfirmationsForUser(userId: string, isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return;
  const supabase = getBrowserSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('grind_confirmations')
      .select('*')
      .eq('owner_user_id', userId);
    if (error) {
      console.warn('[grind] Supabase fetch failed, local cache stands:', error.message);
      return;
    }
    const rows = (data ?? []) as GrindConfirmationRow[];
    const knownServerIds = new Set(
      getSnapshot()
        .map((confirmation) => confirmation.serverId)
        .filter(Boolean) as string[]
    );
    for (const row of rows) {
      if (!knownServerIds.has(row.id)) mergeServerConfirmation(rowToConfirmation(row));
    }

    const pending = getSnapshot().filter(
      (confirmation) => !confirmation.serverId && confirmation.syncPendingFor === userId
    );
    for (const confirmation of pending) {
      await pushGrindConfirmation(confirmation, userId);
    }
  } catch (err) {
    console.warn('[grind] Supabase sync threw, local cache stands:', err);
  }
}
