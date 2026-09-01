'use client';

import type { BrewingMethodId } from '@/lib/types/coffee';

// Crowd-sourced grind-conversion data points. Every time an enthusiast
// adapts a recipe to a different grinder and actually saves the setting
// they used, that's a real (fromModel, toModel, method) → confirmed
// setting data point — logged automatically from
// components/coffee/EnthusiastRecipeForm.tsx, no separate "confirm" UI
// needed. lib/utils/grindConvert.ts prefers an average of these over the
// static lib/data/grindReferenceTable.ts range once at least one exists.
// Same no-backend localStorage pattern as recipeVotesStore.ts.

export interface GrindConfirmation {
  id: string;
  fromModel: string;
  fromSetting: string;
  toModel: string;
  toSetting: string;
  brewingMethodId: BrewingMethodId;
  createdAt: string;
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
    id: `grindconf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  write([confirmation, ...read()]);
  return confirmation;
}
