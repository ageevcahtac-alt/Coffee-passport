import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaristaProfileRow } from '@/lib/types/database';

// A barista created from the cafe cabinet exists only in
// public.barista_profiles, never in the static BARISTAS seed — the barista
// dashboard must still find them by id, or it renders nothing.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let rows: BaristaProfileRow[] = [];

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
  }),
}));

const row = (fields: Partial<BaristaProfileRow>): BaristaProfileRow => ({
  id: 'barista-new',
  coffee_shop_id: 'shop-xo-vsevolozhsk',
  name: 'Анна',
  favorite_origin: '',
  favorite_brew_method: '',
  avatar_url: '',
  created_at: '2026-10-24T00:00:00Z',
  updated_at: '2026-10-24T00:00:00Z',
  ...fields,
});

describe('baristaProfileStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: new MemoryStorage() });
  });

  it('includes a barista that exists only in barista_profiles', async () => {
    rows = [row({ id: 'barista-0f6c', name: 'Анна' })];
    const store = await import('./baristaProfileStore');
    await store.syncBaristaProfilesFromSupabase();
    expect(store.getMergedBaristaById('barista-0f6c')).toMatchObject({
      id: 'barista-0f6c',
      name: 'Анна',
      coffeeShopId: 'shop-xo-vsevolozhsk',
    });
    expect(store.getMergedBaristasForShop('shop-xo-vsevolozhsk').map((b) => b.id)).toContain('barista-0f6c');
  });

  it('keeps seed names for seed baristas and overlays only profile fields', async () => {
    rows = [row({ id: 'barista-xo-alexey', name: 'Другое имя', favorite_origin: 'Бурунди' })];
    const store = await import('./baristaProfileStore');
    await store.syncBaristaProfilesFromSupabase();
    expect(store.getMergedBaristaById('barista-xo-alexey')).toMatchObject({
      name: 'Алексей',
      favoriteOrigin: 'Бурунди',
    });
  });
});
