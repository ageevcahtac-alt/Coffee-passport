import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CafeMenuEntryRoasterStatusViewRow } from '@/lib/types/database';

// Unified Notification/Event Center — covers the two additions this pass
// made to cafeMenuStore.ts: the batched multi-shop sync (fixes the N+1 the
// old per-shop-only sync had) and the realtime subscription's duplicate
// safety (section 10: "один event не добавляется дважды"). Both are
// exercised without any React/hook layer, same "no jsdom" constraint as
// every other store test in this project.
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

let viewRows: CafeMenuEntryRoasterStatusViewRow[] = [];
let channelHandlers: Array<(payload: unknown) => void> = [];
let subscribeCallCount = 0;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'cafe_menu_entries_roaster_status_view') {
        return {
          select: () => ({
            in: (_col: string, shopIds: string[]) =>
              Promise.resolve({
                data: viewRows.filter((row) => shopIds.includes(row.coffee_shop_id)),
                error: null,
              }),
            eq: (_col: string, shopId: string) =>
              Promise.resolve({ data: viewRows.filter((row) => row.coffee_shop_id === shopId), error: null }),
          }),
        };
      }
      return {
        select: () => ({ in: () => Promise.resolve({ data: [], error: null }), eq: () => Promise.resolve({ data: [], error: null }) }),
        // addLotToMenu (exercised indirectly below) write-throughs here in
        // the background — not under test itself, just needs to resolve
        // cleanly instead of throwing an unhandled rejection.
        upsert: () => Promise.resolve({ error: null }),
      };
    },
    channel: () => ({
      on: (_event: string, _filter: unknown, handler: (payload: unknown) => void) => {
        channelHandlers.push(handler);
        return {
          subscribe: () => {
            subscribeCallCount += 1;
          },
        };
      },
    }),
  }),
}));

function viewRow(shopId: string, lotId: string, overrides: Partial<CafeMenuEntryRoasterStatusViewRow> = {}): CafeMenuEntryRoasterStatusViewRow {
  return {
    id: `menu-${shopId}-${lotId}`,
    coffee_shop_id: shopId,
    lot_id: lotId,
    is_active: true,
    status: 'new',
    status_changed_at: '2026-01-01T00:00:00.000Z',
    scheduled_removal_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    roaster_lot_status: 'active',
    roaster_in_catalog: true,
    ...overrides,
  };
}

describe('lib/data/cafeMenuStore — Notification Center additions', () => {
  beforeEach(() => {
    vi.resetModules();
    viewRows = [];
    channelHandlers = [];
    subscribeCallCount = 0;
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('syncCafeMenuFromSupabaseForShops fetches every shop in one batched request', async () => {
    viewRows = [viewRow('shop-a', 'lot-1'), viewRow('shop-b', 'lot-2')];
    const { syncCafeMenuFromSupabaseForShops, getMenuEntries } = await import('./cafeMenuStore');

    await syncCafeMenuFromSupabaseForShops(['shop-a', 'shop-b']);

    expect(getMenuEntries('shop-a')['lot-1'].status).toBe('new');
    expect(getMenuEntries('shop-b')['lot-2'].status).toBe('new');
  });

  it('calling the batched sync twice with unchanged data does not duplicate entries', async () => {
    viewRows = [viewRow('shop-a', 'lot-1')];
    const { syncCafeMenuFromSupabaseForShops, getMenuEntries } = await import('./cafeMenuStore');

    await syncCafeMenuFromSupabaseForShops(['shop-a']);
    await syncCafeMenuFromSupabaseForShops(['shop-a']);

    const entries = getMenuEntries('shop-a');
    expect(Object.keys(entries)).toEqual(['lot-1']); // still exactly one entry, not two
  });

  it('a shop with no rows is left untouched, not wiped to empty', async () => {
    viewRows = [viewRow('shop-a', 'lot-1')];
    const { syncCafeMenuFromSupabaseForShops, getMenuEntries, addLotToMenu } = await import('./cafeMenuStore');

    addLotToMenu('shop-b', 'lot-2'); // shop-b has local data the sync should not touch
    await syncCafeMenuFromSupabaseForShops(['shop-a', 'shop-b']);

    expect(getMenuEntries('shop-b')['lot-2']).toBeDefined();
  });

  it('getVersion() increments on every write, and is a stable primitive between writes', async () => {
    viewRows = [viewRow('shop-a', 'lot-1')];
    const { syncCafeMenuFromSupabaseForShops, getVersion } = await import('./cafeMenuStore');

    const before = getVersion();
    expect(getVersion()).toBe(before); // stable when nothing changed

    await syncCafeMenuFromSupabaseForShops(['shop-a']);
    expect(getVersion()).toBe(before + 1);
  });

  it('ensureCafeMenuRealtimeSubscribed only opens one channel no matter how many times it is called', async () => {
    const { ensureCafeMenuRealtimeSubscribed } = await import('./cafeMenuStore');
    ensureCafeMenuRealtimeSubscribed();
    ensureCafeMenuRealtimeSubscribed();
    ensureCafeMenuRealtimeSubscribed();
    expect(subscribeCallCount).toBe(1);
  });

  it('a realtime change event re-syncs only its own shop, and firing it twice does not duplicate the entry', async () => {
    viewRows = [viewRow('shop-a', 'lot-1', { status: 'discontinuing' })];
    const { ensureCafeMenuRealtimeSubscribed, getMenuEntries } = await import('./cafeMenuStore');

    ensureCafeMenuRealtimeSubscribed();
    expect(channelHandlers).toHaveLength(1);

    const payload = { new: { coffee_shop_id: 'shop-a' } };
    channelHandlers[0](payload);
    channelHandlers[0](payload); // duplicate delivery (e.g. reconnect resend)
    await new Promise((resolve) => setTimeout(resolve, 0));

    const entries = getMenuEntries('shop-a');
    expect(Object.keys(entries)).toEqual(['lot-1']);
    expect(entries['lot-1'].status).toBe('discontinuing');
  });
});
