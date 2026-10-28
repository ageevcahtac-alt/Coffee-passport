import { beforeEach, describe, expect, it, vi } from 'vitest';

// No jsdom in this project (see lotsStore.test.ts) — a Map-backed
// localStorage stand-in is enough for this store.
class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

let result: { data: unknown[] | null; error: { message: string } | null };
vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({ from: () => ({ select: async () => result }) }),
}));

const KEY = 'coffee-passport:coffee-shops';
let storage: MemoryStorage;

async function loadStore() {
  vi.resetModules();
  return import('./coffeeShops');
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {} });
  result = { data: [], error: null };
});

describe('coffeeShops store reads the database, not this browser', () => {
  it('does not mix localStorage edits into what the app shows, but exposes them for transfer', async () => {
    storage.setItem(KEY, JSON.stringify([{ id: 'shop-xo-vsevolozhsk', name: 'Локальная', brandColor: '#ffffff' }]));
    const store = await loadStore();
    expect(store.getCoffeeShopById('shop-xo-vsevolozhsk')?.name).toBe('XO Coffee');
    expect(store.getLegacyCoffeeShops().map((shop) => [shop.id, shop.name])).toEqual([['shop-xo-vsevolozhsk', 'Локальная']]);
  });

  it('lets database rows replace built-in cards and add new shops', async () => {
    result = {
      data: [
        { slug: 'shop-xo-vsevolozhsk', name: 'XO Coffee', status: 'paused', brand_color: '#123456' },
        { slug: 'shop-new', name: 'Новая', status: 'active', brand_color: '#abcdef', lat: 55.79, lng: 49.12, city: 'Казань' },
      ],
      error: null,
    };
    const store = await loadStore();
    const notified = vi.fn();
    store.subscribeCoffeeShops(notified);
    await store.refreshCoffeeShops();
    expect(notified).toHaveBeenCalled();
    expect(store.getCoffeeShopById('shop-xo-vsevolozhsk')).toMatchObject({ brandColor: '#123456', status: 'paused', lat: 60.0167 });
    expect(store.getCoffeeShopById('shop-new')).toMatchObject({ brandColor: '#abcdef', city: 'Казань', lat: 55.79 });
    expect(store.getMapCoffeeShops(store.getCoffeeShopsSnapshot()).map((shop) => shop.id)).not.toContain('shop-xo-vsevolozhsk');
  });

  it('loads the database on a plain lookup too, without a subscriber (cabinet pages)', async () => {
    result = { data: [{ slug: 'shop-new', name: 'Новая', status: 'active' }], error: null };
    const store = await loadStore();
    expect(store.getCoffeeShopById('shop-new')).toBeUndefined();
    await vi.waitFor(() => expect(store.getCoffeeShopById('shop-new')?.name).toBe('Новая'));
  });

  it('keeps the built-in cards when the database is unreachable', async () => {
    result = { data: null, error: { message: 'relation does not exist' } };
    const store = await loadStore();
    await store.refreshCoffeeShops();
    expect(store.getCoffeeShopById('shop-xo-vsevolozhsk')?.status).toBe('active');
  });

  it('moves transferred cards out of the live key into a backup key', async () => {
    storage.setItem(KEY, JSON.stringify([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]));
    const store = await loadStore();
    store.archiveLegacyCoffeeShops(['a']);
    expect(store.getLegacyCoffeeShops().map((shop) => shop.id)).toEqual(['b']);
    expect(JSON.parse(storage.getItem(`${KEY}:transferred`)!).map((shop: { id: string }) => shop.id)).toEqual(['a']);
  });
});
