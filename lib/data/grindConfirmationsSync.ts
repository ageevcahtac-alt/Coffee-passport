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
// Idempotent push — the local confirmation id IS the server row's primary
// key (generateId, per lib/utils/id.ts's contract), so a retry after a
// lost response replays the same INSERT and surfaces a unique-violation
// instead of a duplicate row; rows created before phase 3 get a UUID
// persisted once, at their first push. Exact id matching also drives the
// login-time relink — never fuzzy content matching, which could steal
// another tasting's server row (Codex review round 2).
//
// Sync shape mirrors the checkins pattern (syncCheckinsForUser): save-time
// best-effort push with a login-time pull-merge + retry of parked rows.
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';
import type { GrindConfirmationInsert, GrindConfirmationRow } from '@/lib/types/database';
import {
  getSnapshot,
  mergeServerConfirmation,
  updateSyncState,
  type GrindConfirmation,
} from './grindConfirmationsStore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowToConfirmation(row: GrindConfirmationRow): GrindConfirmation {
  return {
    // Same id the pusher used — a local row with this id (parked or
    // already linked) is the same conversion, never a merge candidate.
    id: row.id,
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
 *
 * Idempotency: the local id (a UUID) is sent as the row's primary key, so
 * a replayed push after a lost response collides with the committed row
 * instead of duplicating it — 23505 is treated as "already there" and
 * stamps the server echo.
 */
export async function pushGrindConfirmation(confirmation: GrindConfirmation, userId: string): Promise<boolean> {
  let id = confirmation.id;
  // Rows logged before phase 3 carry non-UUID ids — mint the server key
  // once and persist it so every retry replays the same INSERT.
  if (!UUID_RE.test(id)) {
    id = generateId();
    updateSyncState(confirmation.id, { id });
  }
  try {
    const row: GrindConfirmationInsert = {
      id,
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
      if (error.code === '23505') {
        // Lost-response replay: the row with this PK is already committed.
        console.warn('[grind] confirmation already on server (replayed push), linking:', error.message);
        updateSyncState(id, { serverId: id, syncPendingFor: null });
        return true;
      }
      console.warn('[grind] Supabase push failed, parked for retry:', error.message);
      updateSyncState(id, { syncPendingFor: userId });
      return false;
    }
    updateSyncState(id, { serverId: data.id as string, syncPendingFor: null });
    return true;
  } catch (err) {
    console.warn('[grind] Supabase push threw, parked for retry:', err);
    updateSyncState(id, { syncPendingFor: userId });
    return false;
  }
}

/**
 * Login-time sync, wired next to syncCheckinsForUser in
 * lib/auth/currentUser.tsx. Three jobs, in this order:
 *  1. relink parked rows whose save-time push actually committed but whose
 *     response was lost (offline flap): the pull reveals the row under the
 *     SAME primary key the pusher sent, so the match is exact — no fuzzy
 *     content matching that could mis-attribute another tasting's row
 *     (Codex review round 2) — and stamp its serverId instead of
 *     inserting a duplicate on retry;
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
      if (rows.some((row) => row.id === confirmation.id)) {
        updateSyncState(confirmation.id, { serverId: confirmation.id, syncPendingFor: null });
      }
      // No row with this PK → genuinely unpushed; it stays parked and the
      // retry below pushes it (with the same id, so a concurrent commit
      // still cannot duplicate).
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
