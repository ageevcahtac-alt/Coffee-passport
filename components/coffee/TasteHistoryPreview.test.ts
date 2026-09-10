import { describe, expect, it } from 'vitest';
import { summarizeTasteHistory } from './TasteHistoryPreview';
import type { TastingRecord } from '@/lib/types/coffee';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §8) — "One Lot
// — Many Cups." Covers current lot / multiple tasting events / multiple
// brew methods / empty history per the block's own required test list.

function makeRecord(overrides: Partial<TastingRecord> = {}): TastingRecord {
  return {
    id: 'record-1',
    userId: 'guest-1',
    lotId: 'LOT-XO-ETH-001',
    roasterId: 'roaster-xo',
    coffeeShopId: 'shop-xo-vsevolozhsk',
    brewingMethod: 'espresso',
    rating: 4,
    sensoryTags: [],
    subDescriptors: {},
    bodyTexture: null,
    defects: [],
    liked: '',
    disliked: '',
    note: '',
    baristaId: '',
    baristaRating: 0,
    baristaNote: '',
    guestFlavorProfile: { acidity: 3, sweetness: 3, body: 3, bitterness: 3 },
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
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as TastingRecord;
}

describe('summarizeTasteHistory', () => {
  it('handles an empty history', () => {
    expect(summarizeTasteHistory([])).toEqual({ visible: [], remaining: 0 });
  });

  it('sorts multiple tasting events newest first', () => {
    const older = makeRecord({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeRecord({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' });
    const { visible } = summarizeTasteHistory([older, newer]);
    expect(visible.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('captures multiple brew methods across attempts of the same lot', () => {
    const espresso = makeRecord({ id: 'a', brewingMethod: 'espresso', createdAt: '2026-01-01T00:00:00.000Z' });
    const v60 = makeRecord({ id: 'b', brewingMethod: 'v60', createdAt: '2026-01-02T00:00:00.000Z' });
    const { visible } = summarizeTasteHistory([espresso, v60]);
    expect(visible.map((r) => r.brewingMethod).sort()).toEqual(['espresso', 'v60']);
  });

  it('caps the visible list at maxVisible and reports the remainder', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ id: `r${i}`, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` })
    );
    const { visible, remaining } = summarizeTasteHistory(records, 3);
    expect(visible).toHaveLength(3);
    expect(remaining).toBe(2);
  });

  it('reports zero remaining when everything fits', () => {
    const records = [makeRecord({ id: 'a' }), makeRecord({ id: 'b' })];
    const { remaining } = summarizeTasteHistory(records, 3);
    expect(remaining).toBe(0);
  });
});
