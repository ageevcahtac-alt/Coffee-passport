'use client';

import type { RoastProfile } from '@/lib/types/coffee';

// Roaster-authored roast curve profiles, attached to a Lot. Same no-backend
// pattern as recipeVotesStore/lotsStore: local persistence now, shaped to
// drop straight onto a future public.roast_profiles table once this flow is
// wired to real auth.

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
