'use client';

import type { CustomDevice } from '@/lib/types/coffee';

// User-submitted filter devices not in FILTER_DEVICE_PRESETS (see
// lib/types/coffee.ts) — starts unapproved (visible only in the
// submitter's own FavoriteDevicePicker) until a Roaster/Admin promotes it
// into the platform-wide preset list via approveCustomDevice. Same
// no-backend localStorage pattern as the rest of this app's stores.

const STORAGE_KEY = 'coffee-passport:custom-devices';

let cache: CustomDevice[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_DEVICES: CustomDevice[] = [];

function read(): CustomDevice[] {
  if (typeof window === 'undefined') return EMPTY_DEVICES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CustomDevice[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(devices: CustomDevice[]) {
  cache = devices;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
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

export function getSnapshot(): CustomDevice[] {
  return read();
}

export function getServerSnapshot(): CustomDevice[] {
  return EMPTY_DEVICES;
}

export function addCustomDevice(
  input: Omit<CustomDevice, 'id' | 'createdAt' | 'approved'>
): CustomDevice {
  const device: CustomDevice = {
    ...input,
    id: `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    approved: false,
    createdAt: new Date().toISOString(),
  };
  write([device, ...read()]);
  return device;
}

export function approveCustomDevice(id: string): void {
  const existing = read();
  const index = existing.findIndex((device) => device.id === id);
  if (index === -1) return;
  const next = [...existing];
  next[index] = { ...next[index], approved: true };
  write(next);
}
