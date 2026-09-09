import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md — closes the "no edit path
// exists for Coffee/Green Lot, for anyone" gap
// (COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md / COFFEE_PASSPORT_END_TO_END_ARCHITECTURE_AUDIT.md
// findings #2/#3). These tests cover updateCoffee()/updateGreenLot()'s own
// write shape directly — RLS itself (the actual owner-restriction
// boundary) is not something a mocked unit test can exercise; that's
// already verified by reading the live policy text
// ("roaster staff manage own coffees"/"...green lots",
// is_roaster_staff_for(roaster_id) — unchanged, re-confirmed by this same
// implementation) and by this project's established convention of proving
// RLS via policy text + live E2E in dedicated blocks, not via mocks.
type Call = { table: string; op: 'update'; patch: Record<string, unknown>; eqColumn: string; eqValue: string };
const calls: Call[] = [];
let nextError: { message: string } | null = null;

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (eqColumn: string, eqValue: string) => {
          calls.push({ table, op: 'update', patch, eqColumn, eqValue });
          return Promise.resolve({ error: nextError });
        },
      }),
    }),
  }),
}));

describe('lib/data/canonicalLotStore — Coffee / Green Lot edit paths', () => {
  beforeEach(() => {
    vi.resetModules();
    calls.length = 0;
    nextError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('updateCoffee', () => {
    it('patches only the fields provided, targeting the exact coffee id', async () => {
      const { updateCoffee } = await import('./canonicalLotStore');
      await updateCoffee('coffee-uuid-1', { country: 'Ethiopia', region: 'Guji' });

      expect(calls).toHaveLength(1);
      expect(calls[0].table).toBe('coffees');
      expect(calls[0].eqColumn).toBe('id');
      expect(calls[0].eqValue).toBe('coffee-uuid-1');
      expect(calls[0].patch).toEqual({ country: 'Ethiopia', region: 'Guji' });
    });

    it('maps every editable field to its snake_case column, including harvestYear -> harvest_year', async () => {
      const { updateCoffee } = await import('./canonicalLotStore');
      await updateCoffee('coffee-uuid-1', {
        country: 'Kenya',
        region: 'Nyeri',
        farm: 'Example Farm',
        producer: 'Example Cooperative',
        variety: 'SL28',
        altitude: '1700m',
        processing: 'Washed',
        harvestYear: '2025/2026',
      });

      expect(calls[0].patch).toEqual({
        country: 'Kenya',
        region: 'Nyeri',
        farm: 'Example Farm',
        producer: 'Example Cooperative',
        variety: 'SL28',
        altitude: '1700m',
        processing: 'Washed',
        harvest_year: '2025/2026',
      });
    });

    it('never includes id/roaster_id in the patch — Coffee identity and ownership are immutable through this function', async () => {
      const { updateCoffee } = await import('./canonicalLotStore');
      await updateCoffee('coffee-uuid-1', { country: 'Colombia' });

      expect(calls[0].patch).not.toHaveProperty('id');
      expect(calls[0].patch).not.toHaveProperty('roaster_id');
    });

    it('makes no Supabase call at all when the patch would be empty', async () => {
      const { updateCoffee } = await import('./canonicalLotStore');
      await updateCoffee('coffee-uuid-1', {});

      expect(calls).toHaveLength(0);
    });

    it('surfaces a real Supabase error as a thrown Error', async () => {
      nextError = { message: 'permission denied' };
      const { updateCoffee } = await import('./canonicalLotStore');

      await expect(updateCoffee('coffee-uuid-1', { country: 'Peru' })).rejects.toThrow('permission denied');
    });
  });

  describe('updateGreenLot', () => {
    it('patches only Green-Lot-owned fields, targeting the exact green lot id', async () => {
      const { updateGreenLot } = await import('./canonicalLotStore');
      await updateGreenLot('green-lot-uuid-1', { purchasedKg: 60, notes: 'Arrived slightly late.' });

      expect(calls).toHaveLength(1);
      expect(calls[0].table).toBe('green_lots');
      expect(calls[0].eqColumn).toBe('id');
      expect(calls[0].eqValue).toBe('green-lot-uuid-1');
      expect(calls[0].patch).toEqual({ purchased_kg: 60, notes: 'Arrived slightly late.' });
    });

    it('maps every editable field to its snake_case column', async () => {
      const { updateGreenLot } = await import('./canonicalLotStore');
      await updateGreenLot('green-lot-uuid-1', {
        purchasedKg: 120.5,
        purchaseDate: '2026-01-15',
        contractReference: 'PO-4471',
        notes: 'Second container.',
      });

      expect(calls[0].patch).toEqual({
        purchased_kg: 120.5,
        purchase_date: '2026-01-15',
        contract_reference: 'PO-4471',
        notes: 'Second container.',
      });
    });

    it('never includes id/coffee_id/roaster_id — a Green Lot cannot be re-parented to a different Coffee through this function', async () => {
      const { updateGreenLot } = await import('./canonicalLotStore');
      await updateGreenLot('green-lot-uuid-1', { notes: 'updated' });

      expect(calls[0].patch).not.toHaveProperty('id');
      expect(calls[0].patch).not.toHaveProperty('coffee_id');
      expect(calls[0].patch).not.toHaveProperty('roaster_id');
    });

    it('makes no Supabase call at all when the patch would be empty', async () => {
      const { updateGreenLot } = await import('./canonicalLotStore');
      await updateGreenLot('green-lot-uuid-1', {});

      expect(calls).toHaveLength(0);
    });

    it('surfaces a real Supabase error as a thrown Error', async () => {
      nextError = { message: 'permission denied' };
      const { updateGreenLot } = await import('./canonicalLotStore');

      await expect(updateGreenLot('green-lot-uuid-1', { notes: 'x' })).rejects.toThrow('permission denied');
    });
  });
});
