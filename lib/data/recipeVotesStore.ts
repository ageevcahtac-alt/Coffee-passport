'use client';

// One vote per (recipe, user) pair on a public Community Brew — see
// components/coffee/VoteButtons.tsx. Same no-backend localStorage pattern
// as the rest of this app's stores.

export interface RecipeVote {
  id: string;
  recipeId: string;
  userId: string;
  value: 1 | -1;
  createdAt: string;
}

const STORAGE_KEY = 'coffee-passport:recipe-votes';

let cache: RecipeVote[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_VOTES: RecipeVote[] = [];

function read(): RecipeVote[] {
  if (typeof window === 'undefined') return EMPTY_VOTES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as RecipeVote[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(votes: RecipeVote[]) {
  cache = votes;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
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

export function getSnapshot(): RecipeVote[] {
  return read();
}

export function getServerSnapshot(): RecipeVote[] {
  return EMPTY_VOTES;
}

// Casting the same value the user already voted clears the vote (a
// toggle); casting the opposite value flips it. Never produces two rows
// for the same (recipeId, userId) pair.
export function castVote(recipeId: string, userId: string, value: 1 | -1): void {
  const existing = read();
  const index = existing.findIndex((vote) => vote.recipeId === recipeId && vote.userId === userId);

  if (index === -1) {
    write([
      ...existing,
      { id: `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, recipeId, userId, value, createdAt: new Date().toISOString() },
    ]);
    return;
  }

  if (existing[index].value === value) {
    write(existing.filter((_, i) => i !== index));
    return;
  }

  const next = [...existing];
  next[index] = { ...next[index], value };
  write(next);
}

export function getNetVotes(recipeId: string, votes: RecipeVote[]): number {
  return votes.reduce((sum, vote) => (vote.recipeId === recipeId ? sum + vote.value : sum), 0);
}

export function getUserVote(recipeId: string, userId: string, votes: RecipeVote[]): 1 | -1 | null {
  return votes.find((vote) => vote.recipeId === recipeId && vote.userId === userId)?.value ?? null;
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's own votes.
export function purgeVotesForUser(userId: string): void {
  write(read().filter((vote) => vote.userId !== userId));
}

// ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md — no backend
// table, so this is a local re-tag like the other Coffee Kitchen stores,
// but castVote() enforces "at most one vote per (recipeId, userId)" as an
// invariant, which a naive re-tag could violate: if this account already
// cast its own vote on a recipe the anonymous session also voted on (e.g.
// voted once anonymously, signed in, then voted again on the same recipe
// before this claim ran), retagging both would leave two rows for the same
// (recipe, account) pair. So any anonymous vote whose recipe the account
// already voted on is dropped rather than retagged — the account's own,
// already-authenticated vote always wins, never silently duplicated.
export async function claimVotesForUser(anonUserId: string, realUserId: string): Promise<void> {
  const existing = read();
  const anonVotes = existing.filter((vote) => vote.userId === anonUserId);
  if (anonVotes.length === 0) return;

  const realRecipeIds = new Set(existing.filter((vote) => vote.userId === realUserId).map((vote) => vote.recipeId));

  write(
    existing
      .filter((vote) => !(vote.userId === anonUserId && realRecipeIds.has(vote.recipeId)))
      .map((vote) => (vote.userId === anonUserId ? { ...vote, userId: realUserId } : vote))
  );
}
