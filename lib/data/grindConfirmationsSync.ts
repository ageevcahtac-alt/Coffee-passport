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
 * lib/auth/currentUser.tsx. Three jobs, in this order:
 *  1. relink parked rows whose save-time push actually committed but whose
 *     response was lost (offline flap): if the pull reveals exactly one
 *     own server row with identical conversion content, stamp its serverId
 *     locally instead of inserting a duplicate on retry — a blind retry
 *     would double-count the confirmation and skew the median;
 *  2. pull this user's server rows and merge server-only ones into the
 *     local store (dedup by serverId — local stays the offline source);
 *  3. retry rows still parked (syncPendingFor = user).
 * Anonymous browsing is a no-op, same as the checkins sync. A true
 * parallel double-push from two tabs remains possible (same race the
 * checkins sync accepts); the lost-response replay above is the dominant
 * failure and is closed.
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

    // Job 1 — relink before merging/retries so the merge below never sees
    // the relinked server row as "server-only" and duplicates it locally.
    for (const confirmation of getSnapshot().filter(
      (candidate) => !candidate.serverId && candidate.syncPendingFor === userId
    )) {
      const matches = rows.filter(
        (row) =>
          row.from_model === confirmation.fromModel &&
          row.to_model === confirmation.toModel &&
          row.brewing_method === confirmation.brewingMethodId &&
          row.from_setting === confirmation.fromSetting &&
          row.to_setting === confirmation.toSetting &&
          row.lot_id === (confirmation.lotId ?? '') &&
          // An own row already linked locally is a DIFFERENT tasting that
          // happens to share the conversion — never steal it.
          !getSnapshot().some((local) => local.serverId === row.id)
      );
      if (matches.length === 1) {
        updateSyncState(confirmation.id, { serverId: matches[0].id, syncPendingFor: null });
      }
      // 0 matches → genuinely unpushed; >1 → ambiguous which server row is
      // ours; both stay parked and the retry below pushes (a possible
      // duplicate only in the ambiguous case, never the lost-response one).
    }

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
