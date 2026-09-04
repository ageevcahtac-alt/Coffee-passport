'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds, useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import { syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useMutedShops } from '@/lib/data/useMutedShops';
import { muteShop } from '@/lib/data/shopMutePreferencesStore';
import { getShopAnnouncements, type ShopAnnouncement } from '@/lib/utils/shopAnnouncements';
import { ROAST_TYPE_LABELS } from '@/lib/types/coffee';
import { LotRemovalCountdown } from './LotRemovalCountdown';

// "Обновления на баре" — the guest-facing side of a cafe's lot lifecycle
// status (see components/cafe/LotStatusControl.tsx). Scoped to shops the
// guest has actually visited (their own TastingRecord history — same
// source CoffeeShopProfileCard's caller already derives) AND hasn't muted
// (see ShopMuteToggle / lib/data/shopMutePreferencesStore.ts) — no
// "follow a shop" concept exists beyond that, so every other shop's status
// changes would just be noise. useCafeMenuLotIds is a per-shop hook, so —
// same as RoasterSupplyMapWidget — this renders one child per shop rather
// than looping the hook inside a single component.
export function BarUpdatesPanel({ visitedShopIds }: { visitedShopIds: string[] }) {
  const { userId, isAuthenticated } = useCurrentUser();
  const mutedShopIds = new Set(
    useMutedShops()
      .filter((record) => record.userId === userId)
      .map((record) => record.shopId)
  );
  const shownShopIds = visitedShopIds.filter((shopId) => !mutedShopIds.has(shopId));

  if (shownShopIds.length === 0) return null;

  return (
    <div className="max-w-md mx-auto w-full mb-6">
      <p className="section-label mb-4">Обновления на баре</p>
      <div className="flex flex-col gap-3">
        {shownShopIds.map((shopId) => (
          <ShopAnnouncements key={shopId} shopId={shopId} userId={userId ?? ''} isAuthenticated={isAuthenticated} />
        ))}
      </div>
    </div>
  );
}

function ShopAnnouncements({
  shopId,
  userId,
  isAuthenticated,
}: {
  shopId: string;
  userId: string;
  isAuthenticated: boolean;
}) {
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
        <AnnouncementCard
          key={`${shopId}-${announcement.lot.id}`}
          shopName={shop.name}
          shopId={shopId}
          userId={userId}
          isAuthenticated={isAuthenticated}
          {...announcement}
        />
      ))}
    </>
  );
}

function AnnouncementCard({
  shopName,
  shopId,
  userId,
  isAuthenticated,
  lot,
  status,
}: ShopAnnouncement & { shopName: string; shopId: string; userId: string; isAuthenticated: boolean }) {
  const isNew = status === 'new';
  const roastLabel = ROAST_TYPE_LABELS[lot.roastType];
  const text = isNew
    ? `${shopName} добавила новый лот: ${lot.country} ${lot.region || lot.name} (${roastLabel})`
    : `${shopName} скоро выводит лот ${lot.country} ${lot.region || lot.name}. Успейте попробовать!`;

  return (
    <div
      className={`relative rounded-md border-2 px-4 py-3.5 text-sm font-medium ${
        isNew ? 'border-moss-500 bg-moss-100 text-moss-700' : 'border-scorch bg-scorch/10 text-scorch'
      }`}
    >
      <button
        type="button"
        onClick={() => userId && muteShop(userId, shopId, isAuthenticated)}
        aria-label={`Не показывать новости от ${shopName}`}
        title="Не показывать новости от этой кофейни"
        className="absolute top-2.5 right-2.5 text-current opacity-60 hover:opacity-100 leading-none text-base px-1"
      >
        ×
      </button>

      <Link
        href={`/shop/${shopId}?country=${encodeURIComponent(lot.country)}&roastType=${lot.roastType}`}
        className="block pr-5 hover:opacity-90 transition-opacity"
      >
        {isNew ? '✨ ' : '⚠ '}
        {text}
        {!isNew && (
          <div className="mt-1.5">
            <LotRemovalCountdown shopId={shopId} lotId={lot.id} />
          </div>
        )}
      </Link>
    </div>
  );
}
