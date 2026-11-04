'use client';

// Crowd-sourced grind-conversion data points. Every time an enthusiast
// adapts a recipe to a different grinder and actually saves the setting
// they used, that's a real (fromModel, toModel, method) → confirmed
// setting data point — logged automatically from
// components/coffee/EnthusiastRecipeForm.tsx, no separate "confirm" UI
// needed. lib/utils/grindConvert.ts prefers an average of these over the
// static lib/data/grindReferenceTable.ts range once at least one exists.
// Same no-backend localStorage pattern as recipeVotesStore.ts.
import { generateId } from '@/lib/utils/id';

export interface GrindConfirmation {
  id: string;
  fromModel: string;
  fromSetting: string;
  toModel: string;
  toSetting: string;
  // Widened to plain string (was BrewingMethodId) — a recipe's method can
  // now also be a STANDARD_BREW_METHOD_CATEGORIES id or a custom method id,
  // see BrewingRecipe.brewingMethodId's own comment in lib/types/coffee.ts.
  brewingMethodId: string;
  createdAt: string;
  // Phase 3 (community sync, 0038) tracking — both absent on rows written
  // before sync existed, which is fine: they just never reach the server.
  // serverId: uuid of the matching grind_confirmations row once pushed.
  // syncPendingFor: userId whose consented save should retry the push on
  // the next login (offline first attempt).
  serverId?: string | null;
  syncPendingFor?: string | null;
  // Local-only audit echo of the tasting's lot public_id, used as the
  // server row's lot_id on push (and preserved across parked retries).
  // Never exposed through the public aggregate view.
  lotId?: string;
}

const STORAGE_KEY = 'coffee-passport:grind-confirmations';

let cache: GrindConfirmation[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_CONFIRMATIONS: GrindConfirmation[] = [];

function read(): GrindConfirmation[] {
  if (typeof window === 'undefined') return EMPTY_CONFIRMATIONS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as GrindConfirmation[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(confirmations: GrindConfirmation[]) {
  cache = confirmations;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(confirmations));
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

export function getSnapshot(): GrindConfirmation[] {
  return read();
}

export function getServerSnapshot(): GrindConfirmation[] {
  return EMPTY_CONFIRMATIONS;
}

export function addGrindConfirmation(input: Omit<GrindConfirmation, 'id' | 'createdAt'>): GrindConfirmation {
  const confirmation: GrindConfirmation = {
    ...input,
    // A real UUID, per lib/utils/id.ts's contract: the local id doubles as
    // the grind_confirmations row's primary key once synced, which is what
    // makes a retry after a lost response idempotent (no duplicate rows,
    // no fuzzy content matching — see grindConfirmationsSync.ts).
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  write([confirmation, ...read()]);
  return confirmation;
}

// Phase 3 sync bookkeeping (lib/data/grindConfirmationsSync.ts): stamp the
// server row id on a successful push, or park the row for a login-time
// retry when the push failed (offline). Only these sync fields may be
// patched — conversion data is user-entered and never edited after save.
// `id` is rewritten once for rows created before phase 3 (whose ids were
// not UUIDs — see pushGrindConfirmation's idempotent-PK design).
export function updateSyncState(
  id: string,
  patch: { id?: string; serverId?: string | null; syncPendingFor?: string | null }
): void {
  const current = read();
  if (!current.some((confirmation) => confirmation.id === id)) return;
  write(
    current.map((confirmation) =>
      confirmation.id === id ? { ...confirmation, ...patch } : confirmation
    )
  );
}

// Phase 3 login-time merge (lib/data/grindConfirmationsSync.ts): add a
// server row to the local cache unless its serverId (or local id) is
// already known — the pull side of the sync, deduplicated both ways.
export function mergeServerConfirmation(confirmation: GrindConfirmation): void {
  const current = read();
  if (current.some((c) => c.serverId && c.serverId === confirmation.serverId)) return;
  if (current.some((c) => c.id === confirmation.id)) return;
  write([confirmation, ...current]);
}
