import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// COFFEE_PASSPORT_FINAL_RELEASE_AUDIT.md — reconcileUserScope is the one
// function standing between account A and account B seeing each other's
// local data on a shared browser (every personal store here is one flat,
// unpartitioned localStorage array). It had zero test coverage anywhere in
// the suite before this. Same no-jsdom, minimal in-memory localStorage
// convention as lib/journey/claimAnonymousData.test.ts.
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

const ACTIVE_USER_KEY = 'coffee-passport:active-user';
const A = 'real-user-A';
const B = 'real-user-B';

function setLocal(key: string, value: unknown) {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.setItem(
    key,
    JSON.stringify(value)
  );
}

function getLocal<T>(key: string): T {
  const raw = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : (undefined as unknown as T);
}

// ACTIVE_USER_KEY is stored by reconcileUserScope as a raw string (no
// JSON.stringify/parse) — unlike every other store's array value — so it
// needs its own pair of accessors rather than setLocal/getLocal.
function setRawLocal(key: string, value: string) {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.setItem(key, value);
}

function getRawLocal(key: string): string | null {
  return (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.getItem(key);
}

// One representative record per store reconcileUserScope purges, tagged to
// A, plus one untouched record belonging to B (or, for brewing-recipes, a
// non-enthusiast/roaster-authored record) — every assertion below checks
// A's record is gone AND the other record survives untouched.
function seedAllStores() {
  setLocal('coffee-passport:journey', [{ id: 'j-a', userId: A }, { id: 'j-b', userId: B }]);
  setLocal('coffee-passport:brewing-recipes', [
    { id: 'r-a', authorType: 'enthusiast', authorId: A },
    { id: 'r-roaster', authorType: 'roaster', authorId: 'roaster-1' },
  ]);
  setLocal('coffee-passport:equipment', [{ id: 'e-a', userId: A }, { id: 'e-b', userId: B }]);
  setLocal('coffee-passport:recipe-votes', [{ id: 'v-a', userId: A }, { id: 'v-b', userId: B }]);
  setLocal('coffee-passport:kitchen-recipes', [{ id: 'k-a', userId: A }, { id: 'k-b', userId: B }]);
  setLocal('coffee-passport:custom-coffees', [{ id: 'c-a', userId: A }, { id: 'c-b', userId: B }]);
  setLocal('coffee-passport:custom-coffee-cuppings', [{ id: 'cc-a', userId: A }, { id: 'cc-b', userId: B }]);
  setLocal('coffee-passport:muted-shops', [{ id: 'm-a', userId: A }, { id: 'm-b', userId: B }]);
  setLocal('coffee-passport:cuppings', [{ id: 'cup-a', userId: A }, { id: 'cup-b', userId: B }]);
}

function idsOf(key: string): string[] {
  return getLocal<{ id: string }[]>(key).map((r) => r.id);
}

beforeEach(() => {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('reconcileUserScope — account-switch data isolation', () => {
  it('purges every personal store for the outgoing account when a different real account signs in', async () => {
    setRawLocal(ACTIVE_USER_KEY, A);
    seedAllStores();

    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope(B, true);

    expect(idsOf('coffee-passport:journey')).toEqual(['j-b']);
    expect(idsOf('coffee-passport:brewing-recipes')).toEqual(['r-roaster']);
    expect(idsOf('coffee-passport:equipment')).toEqual(['e-b']);
    expect(idsOf('coffee-passport:recipe-votes')).toEqual(['v-b']);
    expect(idsOf('coffee-passport:kitchen-recipes')).toEqual(['k-b']);
    expect(idsOf('coffee-passport:custom-coffees')).toEqual(['c-b']);
    expect(idsOf('coffee-passport:custom-coffee-cuppings')).toEqual(['cc-b']);
    expect(idsOf('coffee-passport:muted-shops')).toEqual(['m-b']);
    expect(idsOf('coffee-passport:cuppings')).toEqual(['cup-b']);
    expect(getRawLocal(ACTIVE_USER_KEY)).toBe(B);
  });

  it('re-authenticating as the same account is a no-op — nothing purged', async () => {
    setRawLocal(ACTIVE_USER_KEY, A);
    seedAllStores();

    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope(A, true);

    expect(idsOf('coffee-passport:journey').sort()).toEqual(['j-a', 'j-b']);
    expect(idsOf('coffee-passport:cuppings').sort()).toEqual(['cup-a', 'cup-b']);
    expect(getRawLocal(ACTIVE_USER_KEY)).toBe(A);
  });

  it('an anonymous transition (isAuthenticated=false) never triggers a purge', async () => {
    setRawLocal(ACTIVE_USER_KEY, A);
    seedAllStores();

    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope('anon-device-1', false);

    expect(idsOf('coffee-passport:journey').sort()).toEqual(['j-a', 'j-b']);
    expect(idsOf('coffee-passport:cuppings').sort()).toEqual(['cup-a', 'cup-b']);
    // Anonymous transitions are treated as no signal at all — the active
    // real-account tracker must not be overwritten with an anon id either,
    // so a later real re-login can still detect the switch correctly.
    expect(getRawLocal(ACTIVE_USER_KEY)).toBe(A);
  });

  it('the very first resolved identity (no prior ACTIVE_USER_KEY) purges nothing and just records the account', async () => {
    seedAllStores();

    const { reconcileUserScope } = await import('./userScope');
    reconcileUserScope(A, true);

    expect(idsOf('coffee-passport:journey').sort()).toEqual(['j-a', 'j-b']);
    expect(getRawLocal(ACTIVE_USER_KEY)).toBe(A);
  });
});
