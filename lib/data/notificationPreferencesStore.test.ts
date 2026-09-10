import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unified Notification/Event Center — "disabled setting suppresses
// notifications, enabled restores them" (section 21, tests 10-11).
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
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: remoteRow, error: null }),
        }),
      }),
    }),
  }),
}));

let remoteRow: unknown = null;

describe('lib/data/notificationPreferencesStore', () => {
  beforeEach(() => {
    vi.resetModules();
    upsertedRows.length = 0;
    remoteRow = null;
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('defaults to enabled when no preference has ever been set', async () => {
    const { isNewLotNotificationsEnabled } = await import('./notificationPreferencesStore');
    expect(isNewLotNotificationsEnabled('user-1')).toBe(true);
  });

  it('turning the setting off suppresses it, turning it back on restores it', async () => {
    const { isNewLotNotificationsEnabled, setNewLotNotificationsEnabled } = await import(
      './notificationPreferencesStore'
    );

    setNewLotNotificationsEnabled('user-1', false, false);
    expect(isNewLotNotificationsEnabled('user-1')).toBe(false);

    setNewLotNotificationsEnabled('user-1', true, false);
    expect(isNewLotNotificationsEnabled('user-1')).toBe(true);
  });

  it('is scoped per user — turning it off for one user does not affect another', async () => {
    const { isNewLotNotificationsEnabled, setNewLotNotificationsEnabled } = await import(
      './notificationPreferencesStore'
    );
    setNewLotNotificationsEnabled('user-A', false, false);
    expect(isNewLotNotificationsEnabled('user-A')).toBe(false);
    expect(isNewLotNotificationsEnabled('user-B')).toBe(true);
  });

  it('anonymous writes stay local-only', async () => {
    const { setNewLotNotificationsEnabled } = await import('./notificationPreferencesStore');
    setNewLotNotificationsEnabled('anon-1', false, false);
    expect(upsertedRows).toHaveLength(0);
  });

  it('authenticated writes upsert to Supabase', async () => {
    const { setNewLotNotificationsEnabled } = await import('./notificationPreferencesStore');
    setNewLotNotificationsEnabled('real-user-1', false, true);
    expect(upsertedRows).toHaveLength(1);
    const row = upsertedRows[0].row as Record<string, unknown>;
    expect(row.user_id).toBe('real-user-1');
    expect(row.notify_new_lots).toBe(false);
  });

  it('survives reload via localStorage', async () => {
    const { setNewLotNotificationsEnabled } = await import('./notificationPreferencesStore');
    setNewLotNotificationsEnabled('user-1', false, false);

    vi.resetModules();
    const fresh = await import('./notificationPreferencesStore');
    expect(fresh.isNewLotNotificationsEnabled('user-1')).toBe(false);
  });

  it('claimNotificationPreferenceForUser carries an anonymous guest\'s choice onto their real account', async () => {
    const { setNewLotNotificationsEnabled, claimNotificationPreferenceForUser, isNewLotNotificationsEnabled } =
      await import('./notificationPreferencesStore');

    setNewLotNotificationsEnabled('anon-1', false, false);
    await claimNotificationPreferenceForUser('anon-1', 'real-user-1');

    expect(isNewLotNotificationsEnabled('real-user-1')).toBe(false);
  });

  it('claim never overwrites a real account\'s own already-set preference', async () => {
    const { setNewLotNotificationsEnabled, claimNotificationPreferenceForUser, isNewLotNotificationsEnabled } =
      await import('./notificationPreferencesStore');

    setNewLotNotificationsEnabled('real-user-1', true, false);
    setNewLotNotificationsEnabled('anon-1', false, false);
    await claimNotificationPreferenceForUser('anon-1', 'real-user-1');

    expect(isNewLotNotificationsEnabled('real-user-1')).toBe(true);
  });

  it('purgeNotificationPreferenceForUser only removes the given user\'s row', async () => {
    const { setNewLotNotificationsEnabled, purgeNotificationPreferenceForUser, isNewLotNotificationsEnabled } =
      await import('./notificationPreferencesStore');
    setNewLotNotificationsEnabled('user-A', false, false);
    setNewLotNotificationsEnabled('user-B', false, false);

    purgeNotificationPreferenceForUser('user-A');

    expect(isNewLotNotificationsEnabled('user-A')).toBe(true); // back to default, record gone
    expect(isNewLotNotificationsEnabled('user-B')).toBe(false);
  });
});
