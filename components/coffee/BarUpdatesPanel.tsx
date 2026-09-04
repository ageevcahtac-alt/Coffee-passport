'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds, useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import { syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { getShopAnnouncements, type ShopAnnouncement } from '@/lib/utils/shopAnnouncements';
import { ROAST_TYPE_LABELS } from '@/lib/types/coffee';

// "Обновления на баре" — the guest-facing side of a cafe's lot lifecycle
// status (see components/cafe/LotStatusControl.tsx). Scoped to shops the
// guest has actually visited (their own TastingRecord history — same
// source CoffeeShopProfileCard's caller already derives), not a
// platform-wide feed: no "follow a shop" concept exists to do otherwise,
// and every other shop's status changes would just be noise. useCafeMenuLotIds
// is a per-shop hook, so — same as RoasterSupplyMapWidget — this renders
// one child per shop rather than looping the hook inside a single component.
export function BarUpdatesPanel({ visitedShopIds }: { visitedShopIds: string[] }) {
  if (visitedShopIds.length === 0) return null;

  return (
    <div className="max-w-md mx-auto w-full mb-6">
      <p className="section-label mb-4">Обновления на баре</p>
      <div className="flex flex-col gap-3">
        {visitedShopIds.map((shopId) => (
          <ShopAnnouncements key={shopId} shopId={shopId} />
        ))}
      </div>
    </div>
  );
}

function ShopAnnouncements({ shopId }: { shopId: string }) {
  useEffect(() => {
    void syncCafeMenuFromSupabase(shopId);
  }, [shopId]);

  const shop = getCoffeeShopById(shopId);
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(shopId);
  const entries = useCafeMenuEntries(shopId);
  const menuLots = lots.filter((lot) => menuLotIds.includes(lot.id));
  const announcements = getShopAnnouncements(menuLots, entries);

  if (!shop || announcements.length === 0) return null;

  return (
    <>
      {announcements.map((announcement) => (
        <AnnouncementCard key={`${shopId}-${announcement.lot.id}`} shopName={shop.name} shopId={shopId} {...announcement} />
      ))}
    </>
  );
}

function AnnouncementCard({
  shopName,
  shopId,
  lot,
  status,
}: ShopAnnouncement & { shopName: string; shopId: string }) {
  const isNew = status === 'new';
  const roastLabel = ROAST_TYPE_LABELS[lot.roastType];
  const text = isNew
    ? `${shopName} добавила новый лот: ${lot.country} ${lot.region || lot.name} (${roastLabel})`
    : `${shopName} скоро выводит лот ${lot.country} ${lot.region || lot.name}. Успейте попробовать!`;

  return (
    <Link
      href={`/shop/${shopId}?country=${encodeURIComponent(lot.country)}&roastType=${lot.roastType}`}
      className={`block rounded-md border-2 px-4 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 ${
        isNew ? 'border-moss-500 bg-moss-100 text-moss-700' : 'border-scorch bg-scorch/10 text-scorch'
      }`}
    >
      {isNew ? '✨ ' : '⚠ '}
      {text}
    </Link>
  );
}
