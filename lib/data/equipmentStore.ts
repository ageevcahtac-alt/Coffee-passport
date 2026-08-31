'use client';

import type { EquipmentSetup } from '@/lib/types/coffee';

// The enthusiast's saved personal setup ("Моё оборудование" — see
// app/(site)/journey/equipment/page.tsx), one record per user. Same
// no-backend localStorage pattern as the rest of this app's stores.

const STORAGE_KEY = 'coffee-passport:equipment';

let cache: EquipmentSetup[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_SETUPS: EquipmentSetup[] = [];

function read(): EquipmentSetup[] {
  if (typeof window === 'undefined') return EMPTY_SETUPS;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as EquipmentSetup[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(setups: EquipmentSetup[]) {
  cache = setups;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setups));
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

export function getSnapshot(): EquipmentSetup[] {
  return read();
}

export function getServerSnapshot(): EquipmentSetup[] {
  return EMPTY_SETUPS;
}

export function getEquipmentForUser(userId: string): EquipmentSetup | undefined {
  return read().find((setup) => setup.userId === userId);
}

export function saveEquipment(setup: Omit<EquipmentSetup, 'updatedAt'>): EquipmentSetup {
  const existing = read();
  const index = existing.findIndex((candidate) => candidate.userId === setup.userId);
  const updated: EquipmentSetup = { ...setup, updatedAt: new Date().toISOString() };
  const next = [...existing];
  if (index >= 0) next[index] = updated;
  else next.push(updated);
  write(next);
  return updated;
}

// Called on a real account switch on this device/browser (see
// lib/journey/userScope.ts) — drops the outgoing user's saved Garage setup.
// Only ever removes an *enthusiast* entry in practice: cafe/roaster owner
// ids are fixed pilot ids (ACTIVE_SHOP_ID/ACTIVE_ROASTER_ID), never a
// switching account's userId.
export function purgeEquipmentForUser(userId: string): void {
  write(read().filter((setup) => setup.userId !== userId));
}
