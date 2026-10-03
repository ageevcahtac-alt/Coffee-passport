import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TastingRecord } from '@/lib/types/coffee';

const mocks = vi.hoisted(() => ({ pull: vi.fn(), upsert: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({ from: () => ({
    select: () => ({ eq: mocks.pull }), upsert: mocks.upsert, insert: mocks.insert,
  }) }),
}));
vi.mock('@/lib/data/canonicalLotStore', () => ({
  findCanonicalLotByPublicId: vi.fn(async () => null), getActiveReferenceTasteProfile: vi.fn(async () => null),
}));

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
let storage: MemoryStorage;
function seed(records: Partial<TastingRecord>[]) {
  storage.setItem('coffee-passport:journey', JSON.stringify(records.map((record) => ({
    lotId: 'LOT-1', rating: 4, createdAt: '2026-01-01T00:00:00Z', ...record,
  }))));
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage = new MemoryStorage();
  vi.stubGlobal('window', { localStorage: storage });
  mocks.pull.mockResolvedValue({ data: [], error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('authenticated checkin retry', () => {
  it('uploads only missing records owned by the current user, ignoring id conflicts', async () => {
    seed([{ id: 'missing', userId: 'A' }, { id: 'other', userId: 'B' }, { id: 'anon', userId: 'anonymous' }]);
    const store = await import('./store');
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'missing', owner_user_id: 'A', is_public: false }),
    ], { onConflict: 'id', ignoreDuplicates: true });
    expect(store.getSnapshot()).toHaveLength(3);
  });
  it('does not reinsert server-existing ids and uses the server copy', async () => {
    seed([{ id: 'exists', userId: 'A', rating: 2 }]);
    const store = await import('./store');
    mocks.pull.mockResolvedValue({ data: [store.recordToRow({ ...store.getSnapshot()[0], rating: 5 })], error: null });
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(store.getSnapshot()[0].rating).toBe(5);
  });
  it('never pulls or uploads in anonymous mode', async () => {
    seed([{ id: 'anonymous', userId: 'anonymous' }]);
    await (await import('./store')).syncCheckinsForUser('anonymous', false);
    expect(mocks.pull).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not upload after a failed pull, and retains local data', async () => {
    seed([{ id: 'missing', userId: 'A' }]);
    mocks.pull.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const store = await import('./store');
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(store.getSnapshot()[0].id).toBe('missing');
  });
  it.each(['returned error', 'thrown error'])('retains a failed upload and retries on next sync: %s', async (failure) => {
    seed([{ id: 'missing', userId: 'A' }]);
    if (failure === 'returned error') mocks.upsert.mockResolvedValueOnce({ error: { message: 'offline' } });
    else mocks.upsert.mockRejectedValueOnce(new Error('offline'));
    const store = await import('./store');
    await store.syncCheckinsForUser('A', true);
    expect(store.getSnapshot()[0].id).toBe('missing');
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });
  it('retries an anonymous claim whose first insert failed without changing privacy or reference', async () => {
    seed([{ id: 'claim', userId: 'anon', referenceTasteProfileId: 'taste-v1', isPublic: false }]);
    mocks.insert.mockResolvedValueOnce({ error: { message: 'offline' } });
    const store = await import('./store');
    await store.claimAnonymousTastings('anon', 'A');
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'claim', owner_user_id: 'A', is_public: false, reference_taste_profile_ref: 'taste-v1' }),
    ], { onConflict: 'id', ignoreDuplicates: true });
  });
  it('parks outgoing data outside getSnapshot and restores only its owner on returning', async () => {
    seed([{ id: 'a', userId: 'A' }, { id: 'b', userId: 'B' }]);
    storage.setItem('coffee-passport:active-user', 'A');
    const store = await import('./store');
    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope('B', true);
    expect(store.getSnapshot().map((record) => record.id)).toEqual(['b']);
    await store.syncCheckinsForUser('B', true);
    expect(mocks.upsert.mock.calls[0][0]).toEqual([expect.objectContaining({ owner_user_id: 'B' })]);
    reconcileUserScope('A', true);
    expect(store.getSnapshot().map((record) => record.id)).toEqual(['a']);
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert.mock.calls[1][0]).toEqual([expect.objectContaining({ id: 'a', owner_user_id: 'A' })]);
  });
  it('ignores a pull completed after the identity changed', async () => {
    seed([{ id: 'a', userId: 'A' }]);
    storage.setItem('coffee-passport:active-user', 'A');
    let finish!: (result: unknown) => void;
    mocks.pull.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const store = await import('./store');
    const row = store.recordToRow(store.getSnapshot()[0]);
    const pending = store.syncCheckinsForUser('A', true);
    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope('B', true);
    finish({ data: [row], error: null });
    await pending;
    expect(store.getSnapshot()).toEqual([]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('keeps outgoing records outside the active snapshot even if parking storage fails', async () => {
    seed([{ id: 'a', userId: 'A' }, { id: 'b', userId: 'B' }]);
    const store = await import('./store');
    vi.spyOn(storage, 'setItem').mockImplementation((key) => {
      if (key.startsWith('coffee-passport:journey:user:')) throw new Error('quota');
    });
    store.parkRecordsForUser('A');
    expect(store.getSnapshot().map((record) => record.id)).toEqual(['b']);
    expect(console.warn).toHaveBeenCalled();
  });
  it('restores only records owned by the returning user, even in a malformed partition', async () => {
    seed([]);
    storage.setItem('coffee-passport:journey:user:A', JSON.stringify([
      { id: 'a', userId: 'A' }, { id: 'b', userId: 'B' },
    ]));
    const store = await import('./store');
    store.restoreRecordsForUser('A');
    expect(store.getSnapshot().map((record) => record.id)).toEqual(['a']);
  });
  it('does not merge a late authenticated pull after logout to anonymous scope', async () => {
    seed([{ id: 'a', userId: 'A' }]);
    storage.setItem('coffee-passport:active-user', 'A');
    const store = await import('./store');
    const row = store.recordToRow(store.getSnapshot()[0]);
    let finish!: (result: unknown) => void;
    mocks.pull.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = store.syncCheckinsForUser('A', true);
    (await import('./userScope')).reconcileUserScope('anon', false);
    finish({ data: [{ ...row, rating: 1 }], error: null });
    await pending;
    expect(store.getSnapshot()[0].rating).toBe(4);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('preserves a late historical reference in the parked cache without writing as the new account', async () => {
    seed([{ id: 'template', userId: 'A' }]);
    storage.setItem('coffee-passport:active-user', 'A');
    const canonical = await import('@/lib/data/canonicalLotStore');
    let finish!: (lot: Awaited<ReturnType<typeof canonical.findCanonicalLotByPublicId>>) => void;
    vi.mocked(canonical.findCanonicalLotByPublicId).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(canonical.getActiveReferenceTasteProfile).mockResolvedValueOnce({ id: 'taste-v1' } as Awaited<ReturnType<typeof canonical.getActiveReferenceTasteProfile>>);
    const store = await import('./store');
    const { id: _id, userId: _userId, createdAt: _createdAt, ...input } = store.getSnapshot()[0];
    const added = store.addTastingRecord(input, 'A');
    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope('B', true);
    finish({ id: 'lot-canonical' } as Awaited<ReturnType<typeof canonical.findCanonicalLotByPublicId>>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual([]);
    reconcileUserScope('A', true);
    expect(store.getSnapshot().find((record) => record.id === added.id)?.referenceTasteProfileId).toBe('taste-v1');
  });
  it('handles a rejected initial save and retries its local record on sync', async () => {
    seed([{ id: 'template', userId: 'A' }]);
    mocks.insert.mockRejectedValueOnce(new Error('offline'));
    const store = await import('./store');
    const { id: _id, userId: _userId, createdAt: _createdAt, ...input } = store.getSnapshot()[0];
    const added = store.addTastingRecord(input, 'A');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(console.warn).toHaveBeenCalledWith('[checkins] Supabase write threw, kept local-only:', expect.any(Error));
    await store.syncCheckinsForUser('A', true);
    expect(mocks.upsert.mock.calls[0][0]).toContainEqual(expect.objectContaining({ id: added.id, owner_user_id: 'A' }));
  });
});
