import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TastingForm, type TastingFormValues } from './TastingForm';

const saved: TastingFormValues = {
  rating: 4,
  guestFlavorProfile: { acidity: 1, sweetness: 5, body: 2, bitterness: 4 },
  bodyTexture: null,
  sensoryTags: ['sweetness'],
  subDescriptors: {},
  defects: ['astringent'],
  liked: 'Шоколад',
  disliked: 'Горечь',
  note: 'Хочу попробовать снова',
  milkBalance: 5,
  coffeeReadability: 2,
  creaminess: 4,
  aftertaste: null,
};

describe('TastingForm restored draft', () => {
  // Existing Vitest configuration transforms JSX using the classic runtime;
  // production Next uses its own runtime. Supply React only for this test.
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());
  it('restores rating, notes and all milk-profile axes on remount', () => {
    const html = renderToStaticMarkup(React.createElement(TastingForm, {
      onSave: () => {}, drinkCategory: 'milk_based', initialValues: saved,
    }));
    expect(html).toContain('aria-checked="true" aria-label="4 из 5"');
    expect(html).toContain('Шоколад');
    expect(html).toContain('Горечь');
    expect(html).toContain('Хочу попробовать снова');
    const ranges = [...html.matchAll(/type="range"[^>]*value="(\d+)"/g)].map((match) => Number(match[1]));
    expect(ranges).toEqual([1, 5, 2, 4, 5, 2, 4]);
    expect(html).not.toContain('disabled=""');
  });

  it('keeps the original defaults for a new tasting', () => {
    const html = renderToStaticMarkup(React.createElement(TastingForm, { onSave: () => {} }));
    expect(html).not.toContain('aria-checked="true"');
    const ranges = [...html.matchAll(/type="range"[^>]*value="(\d+)"/g)].map((match) => Number(match[1]));
    expect(ranges).toEqual([3, 3, 3, 3]);
    expect(html).toContain('disabled=""');
  });
});
