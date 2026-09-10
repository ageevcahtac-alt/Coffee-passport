import { describe, expect, it } from 'vitest';
import { compareDescriptors, getGuestDescriptorWords } from './tasteDescriptors';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md) — the reveal's
// core comparison. Deliberately exhaustive on edge cases since this logic
// directly decides what a guest reads as "we agreed" vs "we differed."

describe('getGuestDescriptorWords', () => {
  it('uses the parent tag label when no sub-descriptor was picked under it', () => {
    expect(getGuestDescriptorWords(['citrus'], {})).toEqual(['Цитрусовые']);
  });

  it('uses the specific sub-descriptor words when present, not the parent label', () => {
    expect(getGuestDescriptorWords(['berry'], { berry: ['Клубника', 'Малина'] })).toEqual(['Клубника', 'Малина']);
  });

  it('mixes tags with and without sub-descriptors in pick order', () => {
    expect(getGuestDescriptorWords(['berry', 'citrus', 'chocolate'], { berry: ['Клубника'] })).toEqual([
      'Клубника',
      'Цитрусовые',
      'Шоколадность / Орехи',
    ]);
  });

  it('returns an empty list for no picks at all', () => {
    expect(getGuestDescriptorWords([], {})).toEqual([]);
  });
});

describe('compareDescriptors', () => {
  it('finds an exact full overlap', () => {
    const result = compareDescriptors(['Клубника', 'Цитрус'], ['Клубника', 'Цитрус']);
    expect(result.shared.sort()).toEqual(['Клубника', 'Цитрус'].sort());
    expect(result.guestOnly).toEqual([]);
    expect(result.referenceOnly).toEqual([]);
  });

  it('finds a partial overlap — the worked example from the product brief', () => {
    const result = compareDescriptors(
      ['Клубника', 'Красное яблоко', 'Шоколад'],
      ['Клубника', 'Цитрус', 'Карамель']
    );
    expect(result.shared).toEqual(['Клубника']);
    expect(result.guestOnly).toEqual(['Красное яблоко', 'Шоколад']);
    expect(result.referenceOnly).toEqual(['Цитрус', 'Карамель']);
  });

  it('finds no overlap at all and does not fabricate a partial match', () => {
    const result = compareDescriptors(['Красное яблоко'], ['Цитрус']);
    expect(result.shared).toEqual([]);
    expect(result.guestOnly).toEqual(['Красное яблоко']);
    expect(result.referenceOnly).toEqual(['Цитрус']);
  });

  it('is case- and whitespace-insensitive but never fuzzy beyond that', () => {
    const result = compareDescriptors([' клубника '], ['Клубника']);
    expect(result.shared).toEqual(['Клубника']); // renders using the reference's own wording
    expect(result.guestOnly).toEqual([]);
  });

  it('never treats a near-miss as a match (no invented semantic similarity)', () => {
    const result = compareDescriptors(['Красное яблоко'], ['Зелёное яблоко']);
    expect(result.shared).toEqual([]);
    expect(result.guestOnly).toEqual(['Красное яблоко']);
    expect(result.referenceOnly).toEqual(['Зелёное яблоко']);
  });

  it('deduplicates repeated descriptors on both sides', () => {
    const result = compareDescriptors(['Клубника', 'клубника', 'Клубника'], ['Клубника', 'Клубника']);
    expect(result.guestDescriptors).toEqual(['Клубника']);
    expect(result.referenceDescriptors).toEqual(['Клубника']);
    expect(result.shared).toEqual(['Клубника']);
  });

  it('handles empty guest descriptors', () => {
    const result = compareDescriptors([], ['Клубника', 'Цитрус']);
    expect(result.shared).toEqual([]);
    expect(result.guestOnly).toEqual([]);
    expect(result.referenceOnly).toEqual(['Клубника', 'Цитрус']);
  });

  it('handles a missing/empty reference profile gracefully', () => {
    const result = compareDescriptors(['Клубника', 'Шоколад'], []);
    expect(result.shared).toEqual([]);
    expect(result.guestOnly).toEqual(['Клубника', 'Шоколад']);
    expect(result.referenceOnly).toEqual([]);
  });

  it('handles both sides empty', () => {
    const result = compareDescriptors([], []);
    expect(result.shared).toEqual([]);
    expect(result.guestOnly).toEqual([]);
    expect(result.referenceOnly).toEqual([]);
  });

  it('ignores blank/whitespace-only entries (e.g. a trailing comma in the roaster free-text field)', () => {
    const result = compareDescriptors(['Клубника', '  '], ['Клубника', '', '  ']);
    expect(result.guestDescriptors).toEqual(['Клубника']);
    expect(result.referenceDescriptors).toEqual(['Клубника']);
  });
});
