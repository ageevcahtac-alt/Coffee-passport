'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { reconcileUserScope } from '@/lib/journey/userScope';
import { syncCheckinsForUser } from '@/lib/journey/store';
import { syncRecipesFromSupabase } from '@/lib/data/brewingRecipesStore';

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
    ]);
  }, [authUserId]);

  return <CurrentUserContext.Provider value={state}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserState {
  return useContext(CurrentUserContext);
}
