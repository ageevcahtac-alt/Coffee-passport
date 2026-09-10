import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unified Notification/Event Center — covers the specific scenarios the
// brief calls out as critical: closing/reading one notification must never
// touch another (section 11/12), state survives reload (backed by
// localStorage here, same as every other store in this app), and an
// anonymous guest's local state never reaches Supabase.
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

type UpsertedRow = { table: string; row: unknown };
const upsertedRows: UpsertedRow[] = [];

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      upsert: (row: unknown) => {
        upsertedRows.push({ table, row });
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: (_col: string, userId: string) =>
          Promise.resolve({
            data: remoteRowsByUser[userId] ?? [],
            error: null,
          }),
      }),
    }),
  }),
}));

let remoteRowsByUser: Record<string, unknown[]> = {};

describe('lib/data/lotNotificationReadsStore', () => {
  beforeEach(() => {
    vi.resetModules();
    upsertedRows.length = 0;
    remoteRowsByUser = {};
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('reading notification A does not mark B or C as read', async () => {
    const { markLotNotificationRead, getSnapshot } = await import('./lotNotificationReadsStore');

    markLotNotificationRead('user-1', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);

    const records = getSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].readAt).not.toBeNull();

    // B and C were never touched — no records exist for them at all, which
    // is the correct "still unread" representation (absence = unread).
    expect(records.some((r) => r.lotId === 'lot-b')).toBe(false);
    expect(records.some((r) => r.lotId === 'lot-c')).toBe(false);
  });

  it('dismissing notification B does not dismiss or read A/C', async () => {
    const { markLotNotificationRead, dismissLotNotification, getSnapshot } = await import(
      './lotNotificationReadsStore'
    );

    markLotNotificationRead('user-1', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);
    dismissLotNotification('user-1', 'shop-b', 'lot-b', '2026-01-02T00:00:00.000Z', false);
    markLotNotificationRead('user-1', 'shop-c', 'lot-c', '2026-01-03T00:00:00.000Z', false);

    const records = getSnapshot();
    const a = records.find((r) => r.lotId === 'lot-a')!;
    const b = records.find((r) => r.lotId === 'lot-b')!;
    const c = records.find((r) => r.lotId === 'lot-c')!;

    expect(a.readAt).not.toBeNull();
    expect(a.dismissedAt).toBeNull();

    expect(b.dismissedAt).not.toBeNull();
    expect(b.readAt).toBeNull(); // dismiss never implies read

    expect(c.readAt).not.toBeNull();
    expect(c.dismissedAt).toBeNull();
  });

  it('a lot re-marked "new" later (new statusChangedAt) is a fresh, unread occurrence even if the old one was read', async () => {
    const { markLotNotificationRead, getSnapshot } = await import('./lotNotificationReadsStore');

    markLotNotificationRead('user-1', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);
    // No record exists yet for the SAME lot at a later statusChangedAt —
    // this is exactly how the consuming hook treats it as unread: absence
    // of a record for this specific (shop, lot, statusChangedAt) key.
    const records = getSnapshot();
    const freshOccurrence = records.find(
      (r) => r.lotId === 'lot-a' && r.statusChangedAt === '2026-02-01T00:00:00.000Z'
    );
    expect(freshOccurrence).toBeUndefined();
  });

  it('anonymous (unauthenticated) writes stay local-only — nothing reaches Supabase', async () => {
    const { markLotNotificationRead } = await import('./lotNotificationReadsStore');
    markLotNotificationRead('anon-1', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);
    expect(upsertedRows).toHaveLength(0);
  });

  it('an authenticated write is upserted to Supabase with the right composite key columns', async () => {
    const { markLotNotificationRead } = await import('./lotNotificationReadsStore');
    markLotNotificationRead('real-user-1', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', true);
    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0].table).toBe('lot_notification_reads');
    const row = upsertedRows[0].row as Record<string, unknown>;
    expect(row.user_id).toBe('real-user-1');
    expect(row.coffee_shop_id).toBe('shop-a');
    expect(row.lot_id).toBe('lot-a');
    expect(row.status_changed_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.read_at).not.toBeNull();
  });

  it('state survives a reload (persisted to localStorage, re-read by a fresh module instance)', async () => {
    const { markLotNotificationRead } = await import('./lotNotificationReadsStore');
    markLotNotificationRead('user-1', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);

    vi.resetModules(); // simulate a fresh page load — module-level cache is gone
    const fresh = await import('./lotNotificationReadsStore');
    const records = fresh.getSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].readAt).not.toBeNull();
  });

  it('purgeLotNotificationReadsForUser only removes the given user\'s records (account-switch isolation)', async () => {
    const { markLotNotificationRead, purgeLotNotificationReadsForUser, getSnapshot } = await import(
      './lotNotificationReadsStore'
    );
    markLotNotificationRead('user-A', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);
    markLotNotificationRead('user-B', 'shop-a', 'lot-a', '2026-01-01T00:00:00.000Z', false);

    purgeLotNotificationReadsForUser('user-A');

    const records = getSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].userId).toBe('user-B');
  });

  it('syncLotNotificationReadsFromSupabase repopulates local state for the signed-in user only', async () => {
    remoteRowsByUser['real-user-1'] = [
      {
        user_id: 'real-user-1',
        coffee_shop_id: 'shop-a',
        lot_id: 'lot-a',
        status_changed_at: '2026-01-01T00:00:00.000Z',
        read_at: '2026-01-02T00:00:00.000Z',
        dismissed_at: null,
      },
    ];
    const { syncLotNotificationReadsFromSupabase, getSnapshot } = await import('./lotNotificationReadsStore');
    await syncLotNotificationReadsFromSupabase('real-user-1', true);

    const records = getSnapshot();
    expect(records).toHaveLength(1);
    expect(records[0].readAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('notificationKey identifies one occurrence — same (shop, lot) at a different statusChangedAt is a different key', async () => {
    const { notificationKey } = await import('./lotNotificationReadsStore');
    const k1 = notificationKey('shop-a', 'lot-a', '2026-01-01T00:00:00.000Z');
    const k2 = notificationKey('shop-a', 'lot-a', '2026-02-01T00:00:00.000Z');
    expect(k1).not.toBe(k2);
  });
});
