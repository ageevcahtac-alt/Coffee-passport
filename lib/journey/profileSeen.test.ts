import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TastingRecord } from '@/lib/types/coffee';
import { resolvePassportView, shouldMarkProfileSeen, type PassportView } from '@/app/(site)/passport/[lotId]/passportView';

// "Профиль видел до дегустации": a guest who opened the canonical lot from
// the store path before cupping gets checkins.profile_seen_before_tasting =
// true; the blind coffee-shop path stays false. And whichever path a tasting
// came from, it must reach both cabinets exactly as before — the cafe one
// via the "shop staff read own shop checkins" RLS policy (profiles.cafe_id =
// checkins.coffee_shop_id, no FK: coffee_shops is empty in prod) and the
// roaster one via checkins_roaster_view.
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

type Row = Record<string, unknown>;
type Profile = { role: string; cafe_id: string | null; roaster_id: string | null };

// In-memory public.checkins plus the two read paths the cabinets use, with
// the same predicates the SQL applies.
const checkins: Row[] = [];
let session: Profile | null = null;

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

// Column list of the newest `create view public.checkins_roaster_view`.
function roasterViewColumns(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  let columns: string[] = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/--.*$/gm, '');
    const match = /create\s+(?:or\s+replace\s+)?view\s+public\.checkins_roaster_view\s+as\s+select([\s\S]*?)\sfrom\s+public\.checkins\s+c/i.exec(sql);
    if (match) columns = match[1].split(',').map((c) => c.trim().replace(/^c\./, ''));
  }
  return columns;
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  const run = () => {
    let rows: Row[] = [];
    if (table === 'checkins') {
      // RLS: staff of the shop recorded on the checkin.
      rows = checkins.filter(
        (row) => session && ['barista', 'cafe_admin'].includes(session.role) && session.cafe_id === row.coffee_shop_id
      );
    } else if (table === 'checkins_roaster_view') {
      const columns = roasterViewColumns();
      rows = checkins
        .filter((row) => session?.role === 'roaster_admin' && session.roaster_id === row.roaster_id)
        .map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
    }
    rows = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
    return Promise.resolve({ data: rows, error: null });
  };
  const builder = {
    insert: (payload: Row | Row[]) => {
      checkins.push(...(Array.isArray(payload) ? payload : [payload]));
      return Promise.resolve({ data: null, error: null });
    },
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run().then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({ from: query }),
}));

vi.mock('@/lib/data/canonicalLotStore', () => ({
  findCanonicalLotByPublicId: vi.fn(async () => null),
  getActiveReferenceTasteProfile: vi.fn(async () => null),
}));

const LOT_ID = 'LOT-XO-ETH-001';
const ROASTER_ID = 'roaster-xo';
const CAFE_ID = 'shop-xo-vsevolozhsk';

function tastingInput(): Omit<TastingRecord, 'id' | 'userId' | 'createdAt'> {
  return {
    lotId: LOT_ID,
    roasterId: ROASTER_ID,
    coffeeShopId: CAFE_ID,
    brewingMethod: 'v60' as TastingRecord['brewingMethod'],
    rating: 4,
    sensoryTags: [],
    subDescriptors: {},
    bodyTexture: null,
    defects: [],
    liked: '',
    disliked: '',
    note: '',
    baristaId: 'unspecified',
    baristaRating: 0,
    baristaNote: '',
    guestFlavorProfile: { acidity: 4, sweetness: 3, body: 3, bitterness: 2 },
    drinkCategory: '',
    drinkType: '',
    customDrinkName: '',
    milkBaseType: null,
    cowMilkType: null,
    isLactoseFree: false,
    fatContentPercent: null,
    plantMilkType: null,
    milkBalance: null,
    coffeeReadability: null,
    creaminess: null,
    aftertaste: null,
    isPublic: false,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(
    () => new Promise((resolve) => setTimeout(resolve, 0))
  );
}

// Walks the passport screens a guest sees on a path, marking the profile as
// seen exactly where the page does, then saves the tasting the way the
// taste flow does (flag read from the same marker).
async function tasteVia(entry: 'cafe' | 'shop', userId: string): Promise<void> {
  const { markLotProfileSeen, hasSeenLotProfile } = await import('./profileSeenFlag');
  const { addTastingRecord } = await import('./store');
  const base = { isPreview: false, shopId: null, hasTastingHere: false, canonicalStatus: 'active' as const };
  const views: PassportView[] = [resolvePassportView({ ...base, entry: null }), resolvePassportView({ ...base, entry })];
  if (entry === 'cafe') views.push(resolvePassportView({ ...base, entry, shopId: CAFE_ID }));
  for (const view of views) if (shouldMarkProfileSeen(view)) markLotProfileSeen(LOT_ID);
  addTastingRecord({ ...tastingInput(), profileSeenBeforeTasting: hasSeenLotProfile(LOT_ID) }, userId);
  await flush();
}

describe('profile_seen_before_tasting', () => {
  beforeEach(() => {
    vi.resetModules();
    checkins.length = 0;
    session = null;
    (globalThis as unknown as { window: { localStorage: MemoryStorage; sessionStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('blind coffee-shop path saves false', async () => {
    await tasteVia('cafe', 'guest-cafe');
    expect(checkins).toHaveLength(1);
    expect(checkins[0].profile_seen_before_tasting).toBe(false);
  });

  it('store path (lot opened before cupping) saves true', async () => {
    await tasteVia('shop', 'guest-shop');
    expect(checkins).toHaveLength(1);
    expect(checkins[0].profile_seen_before_tasting).toBe(true);
  });

  it('the flag survives the read back into a TastingRecord', async () => {
    await tasteVia('shop', 'guest-shop');
    const { rowToRecord } = await import('./store');
    expect(rowToRecord(checkins[0] as never).profileSeenBeforeTasting).toBe(true);
  });

  it('a record without the flag (older rows / other writers) maps to false', async () => {
    const { recordToRow } = await import('./store');
    const record: TastingRecord = { ...tastingInput(), id: 't1', userId: 'u1', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(recordToRow(record).profile_seen_before_tasting).toBe(false);
  });
});

describe('tastings from both paths reach the cafe and roaster cabinets', () => {
  beforeEach(() => {
    vi.resetModules();
    checkins.length = 0;
    session = null;
    (globalThis as unknown as { window: { localStorage: MemoryStorage; sessionStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('cafe cabinet (profiles.cafe_id, no coffee_shops row) sees both tastings', async () => {
    await tasteVia('cafe', 'guest-cafe');
    await tasteVia('shop', 'guest-shop');
    session = { role: 'cafe_admin', cafe_id: CAFE_ID, roaster_id: null };
    const { fetchShopCheckins } = await import('@/lib/data/cafeShopCheckins');
    const seen = await fetchShopCheckins(CAFE_ID);
    expect(seen.map((r) => r.userId).sort()).toEqual(['guest-cafe', 'guest-shop']);
    expect(seen.map((r) => r.profileSeenBeforeTasting).sort()).toEqual([false, true]);
  });

  it('roaster cabinet (checkins_roaster_view) sees both tastings, anonymized', async () => {
    await tasteVia('cafe', 'guest-cafe');
    await tasteVia('shop', 'guest-shop');
    session = { role: 'roaster_admin', cafe_id: null, roaster_id: ROASTER_ID };
    const { fetchAnonymizedCheckinsForRoaster } = await import('@/lib/data/checkinsRoasterView');
    const seen = await fetchAnonymizedCheckinsForRoaster();
    expect(seen).toHaveLength(2);
    expect(seen.every((c) => c.lotId === LOT_ID && c.roasterId === ROASTER_ID && c.rating === 4)).toBe(true);
    expect(seen.every((c) => !('owner_user_id' in c) && !('coffee_shop_id' in c))).toBe(true);
  });

  it('another cafe and another roaster see neither', async () => {
    await tasteVia('cafe', 'guest-cafe');
    await tasteVia('shop', 'guest-shop');
    session = { role: 'cafe_admin', cafe_id: 'shop-other', roaster_id: null };
    const { fetchShopCheckins } = await import('@/lib/data/cafeShopCheckins');
    expect(await fetchShopCheckins(CAFE_ID)).toEqual([]);
    session = { role: 'roaster_admin', cafe_id: null, roaster_id: 'roaster-other' };
    const { fetchAnonymizedCheckinsForRoaster } = await import('@/lib/data/checkinsRoasterView');
    expect(await fetchAnonymizedCheckinsForRoaster()).toEqual([]);
  });
});
