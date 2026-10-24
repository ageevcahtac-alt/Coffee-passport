import { describe, expect, it } from 'vitest';
import { isLotProfileVisible, resolvePassportView, shouldMarkProfileSeen, type PassportViewInput } from './passportView';

// The two entry paths after a QR scan land on /passport/[lotId]: a guest in
// a coffee shop takes the blind cupping (location → lock → taste → reveal),
// a guest in a store opens the canonical lot straight away and can cup it
// later. These tests pin which screen each state resolves to and, above
// all, that the blind path never shows the roaster's profile before the
// guest's own tasting is saved.
function input(overrides: Partial<PassportViewInput> = {}): PassportViewInput {
  return {
    isPreview: false,
    entry: null,
    shopId: null,
    hasTastingHere: false,
    canonicalStatus: 'active',
    ...overrides,
  };
}

describe('passport/[lotId] — both paths after a QR scan', () => {
  it('a fresh scan lands on the choice screen', () => {
    expect(resolvePassportView(input())).toBe('choice');
  });

  it('"Я в кофейне" continues the current blind path: shop pick first', () => {
    expect(resolvePassportView(input({ entry: 'cafe' }))).toBe('location');
  });

  it('"Я в магазине" opens the canonical lot right away', () => {
    expect(resolvePassportView(input({ entry: 'shop' }))).toBe('lot-info');
  });

  it('returning from a saved tasting skips the choice and shows the reveal', () => {
    // markPendingShop in the taste flow hands the shop back without an entry pick.
    expect(resolvePassportView(input({ shopId: 'shop-1', hasTastingHere: true }))).toBe('revealed');
  });

  it('business preview is unchanged', () => {
    expect(resolvePassportView(input({ isPreview: true }))).toBe('preview');
  });

  it('a draft lot still cannot start a new blind tasting', () => {
    expect(resolvePassportView(input({ entry: 'cafe', shopId: 'shop-1', canonicalStatus: 'draft' }))).toBe('draft');
  });
});

describe('passport/[lotId] — blind path hides the profile until the guest rates', () => {
  it('stays hidden on every step before the tasting is saved', () => {
    const steps = [
      resolvePassportView(input()),
      resolvePassportView(input({ entry: 'cafe' })),
      resolvePassportView(input({ entry: 'cafe', shopId: 'shop-1' })),
    ];
    expect(steps).toEqual(['choice', 'location', 'blind-lock']);
    for (const view of steps) expect(isLotProfileVisible(view)).toBe(false);
  });

  it('opens only after a tasting exists for this (lot, shop, guest)', () => {
    const view = resolvePassportView(input({ entry: 'cafe', shopId: 'shop-1', hasTastingHere: true }));
    expect(view).toBe('revealed');
    expect(isLotProfileVisible(view)).toBe(true);
  });

  it('the store path shows the profile and marks it as seen; the blind path never marks it', () => {
    expect(isLotProfileVisible('lot-info')).toBe(true);
    expect(shouldMarkProfileSeen('lot-info')).toBe(true);
    for (const view of ['choice', 'location', 'blind-lock', 'draft', 'revealed', 'preview'] as const) {
      expect(shouldMarkProfileSeen(view)).toBe(false);
    }
  });
});
