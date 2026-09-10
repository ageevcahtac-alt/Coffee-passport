import { describe, expect, it } from 'vitest';
import {
  descriptorsByBrewMethod,
  mostCommonDescriptors,
  MIN_TASTINGS_FOR_COMMON_DESCRIPTORS,
} from './communityAggregation';
import type { CommunityTasting } from './store';
import type { SensoryTagId } from '@/lib/types/coffee';

function makeTasting(overrides: Partial<CommunityTasting> = {}): CommunityTasting {
  return {
    rating: 4,
    guestFlavorProfile: { acidity: 3, sweetness: 3, body: 3, bitterness: 3 },
    brewingMethod: 'espresso',
    liked: '',
    disliked: '',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    sensoryTags: [] as SensoryTagId[],
    ...overrides,
  };
}

describe('mostCommonDescriptors', () => {
  it('renders nothing below the minimum sample size (never manufactures a pattern from too little data)', () => {
    const tastings = Array.from({ length: MIN_TASTINGS_FOR_COMMON_DESCRIPTORS - 1 }, () =>
      makeTasting({ sensoryTags: ['berry'] })
    );
    expect(mostCommonDescriptors(tastings)).toEqual([]);
  });

  it('renders nothing if nobody who opted in picked any descriptor', () => {
    const tastings = Array.from({ length: 5 }, () => makeTasting({ sensoryTags: [] }));
    expect(mostCommonDescriptors(tastings)).toEqual([]);
  });

  it('ranks the most frequently picked descriptor first once there is enough data', () => {
    const tastings: CommunityTasting[] = [
      makeTasting({ sensoryTags: ['berry', 'citrus'] }),
      makeTasting({ sensoryTags: ['berry'] }),
      makeTasting({ sensoryTags: ['berry', 'chocolate'] }),
      makeTasting({ sensoryTags: ['chocolate'] }),
    ];
    const result = mostCommonDescriptors(tastings);
    expect(result[0]).toEqual({ label: 'Ягодность', count: 3 });
    expect(result.map((r) => r.label)).toContain('Шоколадность / Орехи');
  });

  it('respects the limit parameter', () => {
    const tastings: CommunityTasting[] = [
      makeTasting({ sensoryTags: ['berry', 'citrus', 'chocolate', 'floral'] }),
      makeTasting({ sensoryTags: ['berry', 'citrus', 'chocolate', 'floral'] }),
      makeTasting({ sensoryTags: ['berry', 'citrus', 'chocolate', 'floral'] }),
    ];
    expect(mostCommonDescriptors(tastings, 2)).toHaveLength(2);
  });
});

describe('descriptorsByBrewMethod', () => {
  it('renders nothing with only one brew method (nothing to contrast)', () => {
    const tastings: CommunityTasting[] = [
      makeTasting({ brewingMethod: 'espresso', sensoryTags: ['berry'] }),
      makeTasting({ brewingMethod: 'espresso', sensoryTags: ['chocolate'] }),
    ];
    expect(descriptorsByBrewMethod(tastings)).toEqual([]);
  });

  it('renders nothing if a second method exists but has too few samples', () => {
    const tastings: CommunityTasting[] = [
      makeTasting({ brewingMethod: 'espresso', sensoryTags: ['berry'] }),
      makeTasting({ brewingMethod: 'espresso', sensoryTags: ['berry'] }),
      makeTasting({ brewingMethod: 'v60', sensoryTags: ['citrus'] }),
    ];
    expect(descriptorsByBrewMethod(tastings)).toEqual([]);
  });

  it('groups descriptors by brew method once both methods have enough samples', () => {
    const tastings: CommunityTasting[] = [
      makeTasting({ brewingMethod: 'espresso', sensoryTags: ['berry'] }),
      makeTasting({ brewingMethod: 'espresso', sensoryTags: ['chocolate'] }),
      makeTasting({ brewingMethod: 'v60', sensoryTags: ['citrus'] }),
      makeTasting({ brewingMethod: 'v60', sensoryTags: ['floral'] }),
    ];
    const result = descriptorsByBrewMethod(tastings);
    expect(result).toHaveLength(2);
    const espresso = result.find((g) => g.brewingMethodLabel === 'Эспрессо');
    expect(espresso?.sampleSize).toBe(2);
    const v60 = result.find((g) => g.brewingMethodLabel.startsWith('V60'));
    expect(v60?.sampleSize).toBe(2);
  });

  it('ignores empty input', () => {
    expect(descriptorsByBrewMethod([])).toEqual([]);
  });
});
