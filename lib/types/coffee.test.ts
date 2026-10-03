import { describe, expect, it } from 'vitest';
import { describeMilkBase, emptyDrinkSelectionDraft, isDrinkSelectionComplete } from './coffee';

describe('guest milk selection', () => {
  const latte = () => ({
    ...emptyDrinkSelectionDraft(),
    drinkCategory: 'milk_based' as const,
    drinkType: 'latte',
  });

  it('allows cow milk without a known type or fat content', () => {
    const draft = { ...latte(), milkBaseType: 'cow' as const };
    expect(isDrinkSelectionComplete(draft)).toBe(true);
    expect(draft.cowMilkType).toBeNull();
    expect(draft.fatContentPercent).toBeNull();
    expect(describeMilkBase(draft)).toBe('');
  });

  it('still requires the milk base', () => {
    expect(isDrinkSelectionComplete(latte())).toBe(false);
  });

  it('still requires a named plant milk', () => {
    expect(isDrinkSelectionComplete({ ...latte(), milkBaseType: 'plant' })).toBe(false);
    expect(isDrinkSelectionComplete({ ...latte(), milkBaseType: 'plant', plantMilkType: 'oat' })).toBe(true);
  });

  it('omits unknown cow details while preserving known details in summaries', () => {
    expect(describeMilkBase({ ...latte(), milkBaseType: 'cow', fatContentPercent: 3.2 })).toBe('3.2%');
    expect(describeMilkBase({ ...latte(), milkBaseType: 'cow', isLactoseFree: true })).toBe('безлактозное');
  });
});
