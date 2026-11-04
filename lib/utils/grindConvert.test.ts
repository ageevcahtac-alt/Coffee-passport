import { describe, expect, it } from 'vitest';
import { HOME_GRINDER_MODELS, PRO_GRINDER_MODELS } from '@/lib/types/coffee';
import { GRIND_REFERENCE_TABLE } from '@/lib/data/grindReferenceTable';
import type { GrindConfirmation } from '@/lib/data/grindConfirmationsStore';
import { estimateGrindSetting, parseLeadingNumber } from '@/lib/utils/grindConvert';

// Core of the "Адаптировать под себя" conversion hint (backlog #2). The
// utility shipped without tests in 98bfb8e — these pin the pure behavior:
// number parsing, reference-range interpolation with clamping, community
// confirmation preference, and every null case.

describe('parseLeadingNumber', () => {
  it.each([
    ['клик 18', 18],
    ['18', 18],
    ['деление 4.5', 4.5],
    ['750 микрон', 750],
    ['-3', -3],
    ['C40: 24 clicks', 40],
  ])('pulls the first number out of %s', (text, want) => {
    expect(parseLeadingNumber(text)).toBe(want);
  });

  it.each([[''], ['abc'], ['клик'], [null], [undefined]])('returns null for %s', (text) => {
    expect(parseLeadingNumber(text as unknown as string)).toBeNull();
  });
});

function confirmation(overrides: Partial<GrindConfirmation>): GrindConfirmation {
  return {
    id: 'c1',
    fromModel: 'Comandante C40',
    fromSetting: '24 клик',
    toModel: 'Timemore C2/C3',
    toSetting: '20',
    brewingMethodId: 'v60',
    createdAt: '2026-11-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('estimateGrindSetting', () => {
  it('returns null when either grinder is missing or they match', () => {
    const base = { fromSettingText: '24 клик', toModel: 'Timemore C2/C3', brewingMethodId: 'v60', confirmations: [] };
    expect(estimateGrindSetting({ ...base, fromModel: '', toModel: 'Timemore C2/C3' })).toBeNull();
    expect(estimateGrindSetting({ ...base, fromModel: 'Comandante C40', toModel: '  ' })).toBeNull();
    expect(estimateGrindSetting({ ...base, fromModel: 'Comandante C40', toModel: 'Comandante C40' })).toBeNull();
  });

  it('returns null instead of guessing when a grinder or method is off the table', () => {
    const base = { fromModel: 'Comandante C40', fromSettingText: '24 клик', confirmations: [] };
    // Unknown grinder — the hint hides rather than invents a number.
    expect(estimateGrindSetting({ ...base, toModel: 'Mazzer Mini', brewingMethodId: 'v60' })).toBeNull();
    // Fellow Ode has deliberately no espresso row (filter-only grinder).
    expect(estimateGrindSetting({ ...base, toModel: 'Fellow Ode', brewingMethodId: 'espresso' })).toBeNull();
    // Unparseable source setting.
    expect(estimateGrindSetting({ ...base, fromSettingText: 'на глаз', toModel: 'Timemore C2/C3', brewingMethodId: 'v60' })).toBeNull();
  });

  it('interpolates the relative position inside the target range', () => {
    const base = { fromModel: 'Comandante C40', toModel: 'Timemore C2/C3', brewingMethodId: 'v60', confirmations: [] };
    // v60 ranges: Comandante 20–26, Timemore 18–22.
    expect(estimateGrindSetting({ ...base, fromSettingText: '20 клик' })).toMatchObject({ rawValue: 18, unit: 'деление', confidence: 'reference' });
    expect(estimateGrindSetting({ ...base, fromSettingText: '23 клик' })).toMatchObject({ rawValue: 20, confidence: 'reference' });
    expect(estimateGrindSetting({ ...base, fromSettingText: '26 клик' })).toMatchObject({ rawValue: 22, confidence: 'reference' });
  });

  it('clamps out-of-range source settings to the target range edges', () => {
    const base = { fromModel: 'Comandante C40', toModel: 'Timemore C2/C3', brewingMethodId: 'v60', confirmations: [] };
    expect(estimateGrindSetting({ ...base, fromSettingText: '1 клик' })).toMatchObject({ rawValue: 18 });
    expect(estimateGrindSetting({ ...base, fromSettingText: '999 клик' })).toMatchObject({ rawValue: 22 });
  });

  it('prefers the community average over the static table for an exact triple', () => {
    const confirmations = [
      confirmation({ id: 'c1', toSetting: 'деление 19' }),
      confirmation({ id: 'c2', toSetting: '21' }),
    ];
    const estimate = estimateGrindSetting({
      fromModel: 'Comandante C40',
      fromSettingText: '24 клик',
      toModel: 'Timemore C2/C3',
      brewingMethodId: 'v60',
      confirmations,
    });
    expect(estimate).toMatchObject({ rawValue: 20, unit: 'деление', confidence: 'community' });
    expect(estimate?.displayText).toContain('2 отметки');
  });

  it('ignores unparseable or mismatched confirmations and falls back to reference', () => {
    const confirmations = [
      confirmation({ id: 'c1', toSetting: 'на глаз' }),
      confirmation({ id: 'c2', brewingMethodId: 'espresso' }),
      confirmation({ id: 'c3', fromModel: 'Mahlkönig EK43' }),
    ];
    const estimate = estimateGrindSetting({
      fromModel: 'Comandante C40',
      fromSettingText: '23 клик',
      toModel: 'Timemore C2/C3',
      brewingMethodId: 'v60',
      confirmations,
    });
    expect(estimate).toMatchObject({ rawValue: 20, confidence: 'reference' });
  });

  // Phase 3 (0038): the cross-device community median outranks this device's
  // local confirmations, which outrank the static reference table.
  describe('server median tier (phase 3)', () => {
    const base = {
      fromModel: 'Comandante C40',
      fromSettingText: '24 клик',
      toModel: 'Timemore C2/C3',
      brewingMethodId: 'v60',
      confirmations: [confirmation({ id: 'c1', toSetting: 'деление 19' }), confirmation({ id: 'c2', toSetting: '21' })],
    };

    it('a server median wins over local confirmations for the same triple', () => {
      const estimate = estimateGrindSetting({ ...base, serverMedian: { value: 18.5, count: 7 } });
      expect(estimate).toMatchObject({ rawValue: 18.5, unit: 'деление', confidence: 'community' });
      expect(estimate?.displayText).toContain('7 отметок');
    });

    it('rounds the median to one decimal, like every other tier', () => {
      // Even-N medians interpolate (percentile_cont averages the two middle
      // rows), so fractional values are the norm, not the exception.
      const estimate = estimateGrindSetting({ ...base, serverMedian: { value: 20.25, count: 2 } });
      expect(estimate?.rawValue).toBe(20.3);
    });

    it('pluralizes the sample size honestly on the single-confirmation edge', () => {
      const one = estimateGrindSetting({ ...base, serverMedian: { value: 21, count: 1 } });
      expect(one?.displayText).toContain('1 отметка');
      const few = estimateGrindSetting({ ...base, serverMedian: { value: 21, count: 3 } });
      expect(few?.displayText).toContain('3 отметки');
    });

    it('an empty or degenerate server median is skipped, not trusted', () => {
      // count=0 (view never emits it, but the type allows it), non-finite
      // value, or a missing median — all fall through to the local tier.
      for (const serverMedian of [{ value: 20, count: 0 }, { value: Number.NaN, count: 2 }, null, undefined]) {
        const estimate = estimateGrindSetting({ ...base, serverMedian });
        expect(estimate?.rawValue).toBe(20); // local average of 19 and 21
      }
    });

    it('keeps the unit from the target model even when the method has no server data', () => {
      const estimate = estimateGrindSetting({
        fromModel: 'Comandante C40',
        fromSettingText: '24 клик',
        toModel: 'Fellow Ode',
        brewingMethodId: 'v60',
        confirmations: [],
        serverMedian: { value: 5.5, count: 4 },
      });
      expect(estimate).toMatchObject({ rawValue: 5.5, unit: 'деление', confidence: 'community' });
    });
  });
});

describe('GRIND_REFERENCE_TABLE sanity', () => {
  it('covers every known grinder model', () => {
    for (const model of [...PRO_GRINDER_MODELS, ...HOME_GRINDER_MODELS]) {
      expect(GRIND_REFERENCE_TABLE[model], model).toBeDefined();
      expect(Object.keys(GRIND_REFERENCE_TABLE[model]!).length, model).toBeGreaterThan(0);
    }
  });

  it('has honest ranges: min < max and a unit on every row', () => {
    for (const [model, methods] of Object.entries(GRIND_REFERENCE_TABLE)) {
      for (const [method, range] of Object.entries(methods)) {
        expect(range!.min, `${model}/${method}`).toBeLessThan(range!.max);
        expect(range!.unit!.trim(), `${model}/${method}`).not.toBe('');
      }
    }
  });
});
