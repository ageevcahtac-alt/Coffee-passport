'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { reconcileUserScope } from '@/lib/journey/userScope';
import { syncCheckinsForUser } from '@/lib/journey/store';
import { claimAnonymousUserData } from '@/lib/journey/claimAnonymousData';
import { syncRecipesFromSupabase } from '@/lib/data/brewingRecipesStore';
import { syncBaristaProfilesFromSupabase } from '@/lib/data/baristaProfileStore';
import { syncMutedShopsFromSupabase } from '@/lib/data/shopMutePreferencesStore';
import { syncNotificationPreferencesFromSupabase } from '@/lib/data/notificationPreferencesStore';
import { syncLotNotificationReadsFromSupabase } from '@/lib/data/lotNotificationReadsStore';

const ANON_ID_KEY = 'coffee-passport:anon-id';

interface CurrentUserState {
  userId: string | null;
  isAuthenticated: boolean;
  // False until the client has resolved a real identity (signed-in Supabase
  // user id, or a per-browser anonymous id) — every store keyed by userId
  // (journey, brewing recipes, equipment, votes) needs this before it's
  // safe to read/write as "the current user", same reasoning as the
  // `mounted` guards already used elsewhere in this app for
  // localStorage-backed reads.
  ready: boolean;
}

const CurrentUserContext = createContext<CurrentUserState>({
  userId: null,
  isAuthenticated: false,
  ready: false,
});

// Read-only counterpart to getOrCreateAnonId() below — used only to check
// "did this device already have an anonymous identity before this
// authentication" (see claimAnonymousTastings' call site). Must never
// create one: calling this instead of getOrCreateAnonId() when resolving
// an anonymous guest's own id would generate a fresh id every time
// ANON_ID_KEY happened to be unset, defeating its whole "stable per
// browser" purpose.
function readExistingAnonId(): string | null {
  try {
    return window.localStorage.getItem(ANON_ID_KEY);
  } catch {
    return null;
  }
}

function getOrCreateAnonId(): string {
  try {
    const existing = window.localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ANON_ID_KEY, generated);
    return generated;
  } catch {
    // Storage unavailable — fall back to a session-only id; personal data
    // just won't persist across reloads for this guest, same as any other
    // localStorage-unavailable path in this app.
    return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// Resolves "who is using the app right now" for every personal, per-user
// store (journey, brewing recipes, equipment, recipe votes): the real
// Supabase user id when signed in (passed down from the server-rendered
// (site) layout, which already calls supabase.auth.getUser()), or a stable
// per-browser anonymous id for guests browsing without an account — never
// the single hardcoded DEMO_USER_ID every visitor used to share. On every
// change of the resolved id (e.g. someone signs into a different account
// on this same device), reconcileUserScope purges the outgoing account's
// personal data from local storage first — see lib/journey/userScope.ts.
export function CurrentUserProvider({
  authUserId,
  children,
}: {
  authUserId: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<CurrentUserState>({
    userId: null,
    isAuthenticated: false,
    ready: false,
  });

  useEffect(() => {
    const resolvedId = authUserId ?? getOrCreateAnonId();
    const isAuthenticated = Boolean(authUserId);

    // GAP 2 (IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md) — must run
    // BEFORE reconcileUserScope, and must read the anon id directly rather
    // than trust any earlier render's state: this is the one moment this
    // device's pre-signup anonymous history can still be identified, right
    // as `authUserId` first becomes non-null. Only ever claims records
    // already sitting in this device's own local cache under this device's
    // own anon id — never anything cross-device or cross-account.
    //
    // ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — widened from
    // claimAnonymousTastings alone to claimAnonymousUserData, which claims
    // tastings plus every other personal, userId-scoped local store (see
    // that function's own comment for the full list and each store's
    // ownership rules) through the exact same one call site.
    if (isAuthenticated) {
      const anonId = readExistingAnonId();
      if (anonId) void claimAnonymousUserData(anonId, resolvedId);
    }

    reconcileUserScope(resolvedId, isAuthenticated);
    // State is set immediately — first paint never waits on the network.
    // The syncs below run in the background: Supabase is the source of
    // truth once reachable, but a slow/offline connection just means the
    // local cache (already restored by reconcileUserScope's purge step)
    // keeps rendering until they resolve, then each store's own
    // useSyncExternalStore subscribers re-render with the synced data.
    setState({ userId: resolvedId, isAuthenticated, ready: true });
    void Promise.allSettled([
      syncCheckinsForUser(resolvedId, isAuthenticated),
      syncRecipesFromSupabase(resolvedId, isAuthenticated),
      syncBaristaProfilesFromSupabase(),
      syncMutedShopsFromSupabase(resolvedId, isAuthenticated),
      syncNotificationPreferencesFromSupabase(resolvedId, isAuthenticated),
      syncLotNotificationReadsFromSupabase(resolvedId, isAuthenticated),
    ]);
  }, [authUserId]);

  return <CurrentUserContext.Provider value={state}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserState {
  return useContext(CurrentUserContext);
}
