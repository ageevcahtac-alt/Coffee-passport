import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGrindServerMedians, medianKey } from './grindServerMedians';

// Phase 3 (0038): the community-median map the converter's tier 1 reads.
// The SQL median itself is pinned statically in supabase/grindConfirmations.test.ts
// (offline CI has no Postgres); this file pins the TS mapping around it —
// including the edge rows a real view can return.
let fetchRows: Record<string, unknown>[] = [];
let fetchError: { message: string } | null = null;

// The hook reads the anonymous view with a bare select('*') — no filters.
vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        expect(table).toBe('grind_conversion_medians');
        expect(columns).toBe('*');
        return Promise.resolve(
          fetchError ? { data: null, error: fetchError } : { data: fetchRows, error: null }
        ) as unknown as { then: (onFulfilled: (value: unknown) => unknown) => unknown };
      },
    }),
  }),
}));

describe('fetchGrindServerMedians', () => {
  beforeEach(() => {
    fetchRows = [];
    fetchError = null;
  });

  it('maps view rows onto medianKey -> { value, count }', async () => {
    fetchRows = [
      {
        from_model: 'Comandante C40',
        to_model: 'Timemore C2/C3',
        brewing_method: 'v60',
        confirmations_count: 3,
        median_to_setting: 20,
      },
    ];
    const map = await fetchGrindServerMedians();
    expect(map.get(medianKey('Comandante C40', 'Timemore C2/C3', 'v60'))).toEqual({ value: 20, count: 3 });
  });

  it('drops the empty edges: null median (no parseable row) and zero count never enter the map', async () => {
    fetchRows = [
      {
        from_model: 'A',
        to_model: 'B',
        brewing_method: 'v60',
        confirmations_count: 0,
        median_to_setting: null,
      },
      {
        from_model: 'C',
        to_model: 'D',
        brewing_method: 'espresso',
        confirmations_count: 2,
        median_to_setting: null,
      },
    ];
    const map = await fetchGrindServerMedians();
    expect(map.size).toBe(0);
  });

  it('fetch failure degrades to an empty map so the converter falls back locally', async () => {
    fetchError = { message: 'relation "grind_conversion_medians" does not exist' };
    const map = await fetchGrindServerMedians();
    expect(map.size).toBe(0);
  });
});

describe('medianKey', () => {
  it('joins the conversion triple with a separator the models cannot contain', () => {
    // Grinder model names and method ids never carry '|' — the key is
    // unambiguous for every catalog model / method pair.
    expect(medianKey('Comandante C40', 'Timemore C2/C3', 'v60')).toBe('Comandante C40|Timemore C2/C3|v60');
  });
});
