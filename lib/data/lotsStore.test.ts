import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lot } from '@/lib/types/coffee';

// COFFEE_GREEN_LOT_PROVENANCE_SYNC_IMPLEMENTATION.md — covers the
// Category B gap from COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md: rowToLot() used
// to source every origin field (country/region/variety/process/cropYear/
// producer.*) from `fallback` only, so any device without a pre-existing
// local cache entry for a real (non-seed) Lot saw it blank, even though a
// real `coffees` row existed. These tests cover both the pure mapping
// function directly and the full sync/cache interaction.
//
// No jsdom is installed in this project (see lib/journey/store.test.ts's
// own note on the same constraint) — a minimal in-memory localStorage
// stand-in is enough since lib/data/lotsStore.ts only ever calls
// window.localStorage.getItem/setItem.
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

type SelectResult = { data: unknown[] | null; error: { message: string } | null };
let nextSelectResult: SelectResult = { data: [], error: null };

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: () => ({
      select: () => Promise.resolve(nextSelectResult),
    }),
  }),
}));

function baseLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'LOT-XO-TEST-001',
    roasterId: 'roaster-xo',
    name: 'Ethiopia Guji',
    country: '',
    region: '',
    variety: '',
    process: '',
    cropYear: '',
    qGrade: 0,
    roastProfile: '',
    roastType: 'filter',
    descriptors: [],
    roasterFlavorProfile: { acidity: 0, sweetness: 0, body: 0, bitterness: 0 },
    inRoasterCatalog: true,
    producer: { farmerName: '', farmName: '', altitude: '', story: '' },
    ...overrides,
  };
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uuid-lot-1',
    public_id: 'LOT-XO-TEST-001',
    roaster_id: 'uuid-roaster-1',
    green_lot_id: 'uuid-green-lot-1',
    name: 'Ethiopia Guji',
    descriptors: [] as string[],
    q_grade: null,
    roast_type: '',
    roast_profile_label: '',
    status: 'draft',
    in_roaster_catalog: true,
    legacy_text_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    roasters: { slug: 'roaster-xo' },
    reference_taste_profiles: [] as unknown[],
    green_lots: null as unknown,
    ...overrides,
  };
}

const fullCoffee = {
  country: 'Ethiopia',
  region: 'Guji',
  farm: 'Hambela Washing Station',
  producer: 'Kochere Cooperative',
  variety: 'Heirloom',
  altitude: '1900-2100m',
  processing: 'Washed',
  harvest_year: '2025/2026',
};

describe('lib/data/lotsStore — Coffee/Green Lot provenance sync', () => {
  beforeEach(() => {
    vi.resetModules();
    nextSelectResult = { data: [], error: null };
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  describe('rowToLot — pure mapping', () => {
    it('prefers the joined Coffee row over an empty fallback (device with no local cache)', async () => {
      const { rowToLot } = await import('./lotsStore');
      const row = baseRow({ green_lots: { coffees: fullCoffee } });
      const lot = rowToLot(row as never, undefined);

      expect(lot.country).toBe('Ethiopia');
      expect(lot.region).toBe('Guji');
      expect(lot.variety).toBe('Heirloom');
      expect(lot.process).toBe('Washed');
      expect(lot.cropYear).toBe('2025/2026');
      expect(lot.producer.farmerName).toBe('Kochere Cooperative');
      expect(lot.producer.farmName).toBe('Hambela Washing Station');
      expect(lot.producer.altitude).toBe('1900-2100m');
    });

    it('falls back to the existing local value when green_lots/coffees is null (legacy Lot without full provenance)', async () => {
      const { rowToLot } = await import('./lotsStore');
      const row = baseRow({ green_lots: null });
      const fallback = baseLot({ country: 'Colombia', region: 'Huila' });
      const lot = rowToLot(row as never, fallback);

      expect(lot.country).toBe('Colombia');
      expect(lot.region).toBe('Huila');
    });

    it('falls back to the existing local value when green_lots is present but coffees is null', async () => {
      const { rowToLot } = await import('./lotsStore');
      const row = baseRow({ green_lots: { coffees: null } });
      const fallback = baseLot({ country: 'Kenya' });
      const lot = rowToLot(row as never, fallback);

      expect(lot.country).toBe('Kenya');
    });

    it('never crashes and returns empty strings with no fallback and no Coffee data at all', async () => {
      const { rowToLot } = await import('./lotsStore');
      const row = baseRow({ green_lots: null });
      const lot = rowToLot(row as never, undefined);

      expect(lot.country).toBe('');
      expect(lot.region).toBe('');
      expect(lot.producer.farmerName).toBe('');
    });

    it('does not let an empty Coffee field overwrite good existing local data (partial/incomplete canonical response)', async () => {
      const { rowToLot } = await import('./lotsStore');
      const row = baseRow({ green_lots: { coffees: { ...fullCoffee, region: '' } } });
      const fallback = baseLot({ region: 'Existing Region' });
      const lot = rowToLot(row as never, fallback);

      expect(lot.country).toBe('Ethiopia'); // Coffee's own value used
      expect(lot.region).toBe('Existing Region'); // blank Coffee field falls back, not overwritten with ''
    });

    it('always sources producer.story from the local fallback — Coffee has no story equivalent', async () => {
      const { rowToLot } = await import('./lotsStore');
      const row = baseRow({ green_lots: { coffees: fullCoffee } });
      const fallback = baseLot({ producer: { farmerName: '', farmName: '', altitude: '', story: 'A hand-written tale.' } });
      const lot = rowToLot(row as never, fallback);

      expect(lot.producer.story).toBe('A hand-written tale.');
    });
  });

  describe('syncLotsFromSupabase — cache interaction', () => {
    it('B: populates provenance for a Lot with no pre-existing local cache entry (a different/new device)', async () => {
      nextSelectResult = {
        data: [baseRow({ public_id: 'LOT-XO-NEW-001', green_lots: { coffees: fullCoffee } })],
        error: null,
      };
      const { syncLotsFromSupabase, getMergedLotById } = await import('./lotsStore');
      await syncLotsFromSupabase();

      const lot = getMergedLotById('LOT-XO-NEW-001');
      expect(lot?.country).toBe('Ethiopia');
      expect(lot?.region).toBe('Guji');
    });

    it('C: never overwrites an existing local override with the canonical row (creating device already has correct data)', async () => {
      nextSelectResult = {
        data: [baseRow({ public_id: 'LOT-XO-TEST-001', green_lots: { coffees: fullCoffee } })],
        error: null,
      };
      const { syncLotsFromSupabase, saveLot, getMergedLotById } = await import('./lotsStore');
      saveLot(baseLot({ country: 'Locally Typed Country', region: 'Locally Typed Region' }));

      await syncLotsFromSupabase();

      const lot = getMergedLotById('LOT-XO-TEST-001');
      // The local override wins wholesale — unchanged by this fix, and
      // exactly why scenario A (the creating device) was never broken.
      expect(lot?.country).toBe('Locally Typed Country');
      expect(lot?.region).toBe('Locally Typed Region');
    });

    it('D: a row with no green_lots join at all does not throw and still syncs other fields', async () => {
      nextSelectResult = {
        data: [baseRow({ public_id: 'LOT-XO-LEGACY-001', green_lots: null, name: 'Legacy Lot' })],
        error: null,
      };
      const { syncLotsFromSupabase, getMergedLotById } = await import('./lotsStore');
      await expect(syncLotsFromSupabase()).resolves.toBeUndefined();

      const lot = getMergedLotById('LOT-XO-LEGACY-001');
      expect(lot?.name).toBe('Legacy Lot');
      expect(lot?.country).toBe('');
    });
  });
});
