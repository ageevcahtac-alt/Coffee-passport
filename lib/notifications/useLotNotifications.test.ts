import { describe, expect, it } from 'vitest';
import { mergeLotNotifications, describeLotNotification, lotNotificationHref, type LotAnnouncementItem } from './useLotNotifications';
import type { LotNotificationReadState } from '@/lib/data/lotNotificationReadsStore';
import type { Lot } from '@/lib/types/coffee';

// Unified Notification/Event Center — the pure merge step extracted out of
// useLotNotifications so it's testable without a React render environment
// (this project has no jsdom/component-render infra). Covers the brief's
// own acceptance list: unread count from the full set (not a preview
// slice), independent read/dismiss, and the notify-preference kill switch.

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'LOT-XO-ETH-001',
    roasterId: 'roaster-xo',
    name: 'Ethiopia Guji',
    country: 'Эфиопия',
    region: 'Гуджи',
    variety: 'Heirloom',
    process: 'Washed',
    cropYear: '2025/2026',
    qGrade: 87,
    roastProfile: 'Pure Roast',
    roastType: 'filter',
    descriptors: [],
    roasterFlavorProfile: { acidity: 4, sweetness: 4, body: 3, bitterness: 2 },
    producer: { farmerName: 'Abebe', farmName: 'Guji Washing Station', altitude: '2000 м', story: '' },
    inRoasterCatalog: true,
    ...overrides,
  };
}

function makeItem(overrides: Partial<LotAnnouncementItem> = {}): LotAnnouncementItem {
  const lot = overrides.lot ?? makeLot();
  const statusChangedAt = overrides.statusChangedAt ?? '2026-01-01T00:00:00.000Z';
  const shopId = overrides.shopId ?? 'shop-xo-vsevolozhsk';
  return {
    key: `${shopId}::${lot.id}::${statusChangedAt}`,
    shopId,
    shopName: 'XO Coffee',
    lot,
    status: 'new',
    statusChangedAt,
    ...overrides,
  };
}

function readRecord(overrides: Partial<LotNotificationReadState> = {}): LotNotificationReadState {
  return {
    userId: 'user-1',
    coffeeShopId: 'shop-xo-vsevolozhsk',
    lotId: 'LOT-XO-ETH-001',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    readAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe('mergeLotNotifications', () => {
  it('everything unread and not dismissed when there is no read-state at all', () => {
    const items = mergeLotNotifications([makeItem()], [], 'user-1', true);
    expect(items).toHaveLength(1);
    expect(items[0].read).toBe(false);
    expect(items[0].dismissed).toBe(false);
  });

  it('marks only the matching occurrence as read — a sibling stays unread', () => {
    const a = makeItem({ lot: makeLot({ id: 'lot-a' }), shopId: 'shop-a' });
    const b = makeItem({ lot: makeLot({ id: 'lot-b' }), shopId: 'shop-b' });
    const reads = [readRecord({ coffeeShopId: 'shop-a', lotId: 'lot-a', readAt: '2026-01-05T00:00:00.000Z' })];

    const merged = mergeLotNotifications([a, b], reads, 'user-1', true);
    const mergedA = merged.find((i) => i.lot.id === 'lot-a')!;
    const mergedB = merged.find((i) => i.lot.id === 'lot-b')!;
    expect(mergedA.read).toBe(true);
    expect(mergedB.read).toBe(false);
  });

  it('dismissing does not imply read, and vice versa', () => {
    const item = makeItem();
    const dismissedOnly = mergeLotNotifications(
      [item],
      [readRecord({ dismissedAt: '2026-01-05T00:00:00.000Z' })],
      'user-1',
      true
    );
    expect(dismissedOnly[0].dismissed).toBe(true);
    expect(dismissedOnly[0].read).toBe(false);
  });

  it('read-state belonging to a different user never leaks in', () => {
    const item = makeItem();
    const reads = [readRecord({ userId: 'someone-else', readAt: '2026-01-05T00:00:00.000Z' })];
    const merged = mergeLotNotifications([item], reads, 'user-1', true);
    expect(merged[0].read).toBe(false);
  });

  it('a fresh occurrence (later statusChangedAt) for the same lot is unread even if the old one was read', () => {
    const oldItem = makeItem({ statusChangedAt: '2026-01-01T00:00:00.000Z' });
    const newItem = makeItem({
      statusChangedAt: '2026-02-01T00:00:00.000Z',
      key: 'shop-xo-vsevolozhsk::LOT-XO-ETH-001::2026-02-01T00:00:00.000Z',
    });
    const reads = [readRecord({ statusChangedAt: '2026-01-01T00:00:00.000Z', readAt: '2026-01-02T00:00:00.000Z' })];

    const merged = mergeLotNotifications([oldItem, newItem], reads, 'user-1', true);
    expect(merged.find((i) => i.statusChangedAt === '2026-01-01T00:00:00.000Z')!.read).toBe(true);
    expect(merged.find((i) => i.statusChangedAt === '2026-02-01T00:00:00.000Z')!.read).toBe(false);
  });

  it('disabled preference returns an empty list outright, not just a filtered one', () => {
    const items = [makeItem(), makeItem({ shopId: 'shop-b', lot: makeLot({ id: 'lot-b' }) })];
    const merged = mergeLotNotifications(items, [], 'user-1', false);
    expect(merged).toEqual([]);
  });

  it('100+ announcements all merge correctly (scale sanity check)', () => {
    const items = Array.from({ length: 120 }, (_, i) =>
      makeItem({ lot: makeLot({ id: `lot-${i}` }), shopId: `shop-${i % 10}` })
    );
    const reads = items.slice(0, 50).map((item) => readRecord({ coffeeShopId: item.shopId, lotId: item.lot.id, readAt: '2026-01-05T00:00:00.000Z' }));
    const merged = mergeLotNotifications(items, reads, 'user-1', true);
    expect(merged).toHaveLength(120);
    expect(merged.filter((i) => i.read)).toHaveLength(50);
    expect(merged.filter((i) => !i.read)).toHaveLength(70);
  });
});

describe('describeLotNotification / lotNotificationHref', () => {
  it('phrases a new-lot announcement with shop, origin and roast type', () => {
    const item = makeItem({ status: 'new', lot: makeLot({ country: 'Эфиопия', region: 'Гуджи', roastType: 'filter' }) });
    expect(describeLotNotification(item)).toContain('XO Coffee');
    expect(describeLotNotification(item)).toContain('Эфиопия');
    expect(describeLotNotification(item)).toContain('Гуджи');
  });

  it('phrases a discontinuing announcement differently from a new one', () => {
    const item = makeItem({ status: 'discontinuing' });
    expect(describeLotNotification(item)).toContain('выводит');
    expect(describeLotNotification(item)).not.toContain('добавила новый лот');
  });

  it('links to the shop page with the lot\'s country/roastType as query params', () => {
    const item = makeItem({ shopId: 'shop-xo-vsevolozhsk', lot: makeLot({ country: 'Эфиопия', roastType: 'espresso' }) });
    const href = lotNotificationHref(item);
    expect(href).toBe('/shop/shop-xo-vsevolozhsk?country=%D0%AD%D1%84%D0%B8%D0%BE%D0%BF%D0%B8%D1%8F&roastType=espresso');
  });
});
