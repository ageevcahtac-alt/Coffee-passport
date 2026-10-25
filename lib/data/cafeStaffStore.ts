'use client';

import type { StaffMember } from '@/lib/types/coffee';
import { STAFF as SEED_STAFF } from './staff';

// Static seed roster plus staff cards a cafe once saved only in this browser
// (localStorage, before staff became real logins — see
// app/api/cafe/staff/barista-accounts). Nothing writes here any more; cards
// already saved are still read and shown so they are not lost. Overrides win
// on id collision, which is how an edited seed card used to work.

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

// A card that exists only in this browser's storage (not in the seed).
export function isBrowserOnlyStaff(id: string): boolean {
  return !SEED_STAFF.some((member) => member.id === id) && readOverrides().some((member) => member.id === id);
}
