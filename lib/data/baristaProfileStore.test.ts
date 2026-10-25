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
const MAX_ROWS = 1000;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    // PostgREST caps a response (max-rows): the store must page with range().
    from: () => ({
      select: () => ({
        order: () => ({
          range: (from: number, to: number) =>
            Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }),
        }),
      }),
    }),
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

  // Guest rating form: the cafe's roster comes from the database, so a barista
  // the cafe just created is a choice right away; 'Не указан' stays last.
  it('offers a just-created barista in the guest rating form, before "Не указан"', async () => {
    rows = [row({ id: 'barista-0f6c', name: 'Анна' }), row({ id: 'barista-elsewhere', coffee_shop_id: 'shop-other', name: 'Чужой' })];
    const store = await import('./baristaProfileStore');
    await store.syncBaristaProfilesFromSupabase();
    const choices = store.getBaristaChoicesForShop('shop-xo-vsevolozhsk').map((b) => b.name);
    expect(choices).toContain('Анна');
    expect(choices).not.toContain('Чужой');
    expect(choices[choices.length - 1]).toBe('Не указан');
  });

  // Codex review PR #25: pruning by one capped response deleted live baristas.
  it('reads the whole roster page by page before dropping anyone', async () => {
    rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => row({ id: `barista-${String(i).padStart(5, '0')}`, name: `Б${i}` }));
    const store = await import('./baristaProfileStore');
    await store.syncBaristaProfilesFromSupabase();
    expect(store.getMergedBaristaById(`barista-${String(MAX_ROWS).padStart(5, '0')}`)).toBeDefined();
  });

  it('drops a barista the database no longer has (account removed)', async () => {
    rows = [row({ id: 'barista-0f6c', name: 'Анна' })];
    let store = await import('./baristaProfileStore');
    await store.syncBaristaProfilesFromSupabase();
    expect(store.getMergedBaristaById('barista-0f6c')).toBeDefined();

    vi.resetModules();
    rows = [];
    store = await import('./baristaProfileStore');
    await store.syncBaristaProfilesFromSupabase();
    expect(store.getMergedBaristaById('barista-0f6c')).toBeUndefined();
    expect(store.getMergedBaristaById('barista-xo-alexey')).toBeDefined();
  });
});
