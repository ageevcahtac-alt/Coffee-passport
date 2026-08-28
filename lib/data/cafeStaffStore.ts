'use client';

import type { StaffMember } from '@/lib/types/coffee';
import { STAFF as SEED_STAFF } from './staff';

// Cafe-created/edited staff records layer on top of the static seed roster,
// the same way lotsStore does for lots: no backend yet, so edits live in
// localStorage and are merged with the seed roster at read time. Overrides
// win on id collision, which is also how editing an existing (seed) staff
// member works.

const STORAGE_KEY = 'coffee-passport:staff';

let cache: StaffMember[] | null = null;
const listeners = new Set<() => void>();

function readOverrides(): StaffMember[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StaffMember[]) : [];
  } catch {
    return [];
  }
}

function computeAll(): StaffMember[] {
  const merged = new Map<string, StaffMember>();
  for (const member of SEED_STAFF) merged.set(member.id, member);
  for (const member of readOverrides()) merged.set(member.id, member);
  return Array.from(merged.values());
}

function read(): StaffMember[] {
  if (typeof window === 'undefined') return SEED_STAFF;
  if (!cache) cache = computeAll();
  return cache;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): StaffMember[] {
  return read();
}

export function getServerSnapshot(): StaffMember[] {
  return SEED_STAFF;
}

export function getMergedStaffById(id: string): StaffMember | undefined {
  return read().find((member) => member.id === id);
}

export function saveStaffMember(member: StaffMember): void {
  const overrides = readOverrides();
  const index = overrides.findIndex((existing) => existing.id === member.id);
  if (index >= 0) overrides[index] = member;
  else overrides.push(member);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — the in-memory cache below still reflects the
    // save for the rest of this session.
  }
  cache = computeAll();
  listeners.forEach((listener) => listener());
}

export function generateStaffId(): string {
  return `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
