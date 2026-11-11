'use client';

import { useEffect, useState } from 'react';
import { useStaffSession } from '@/lib/auth/staffSession';
import {
  fetchGuestDisplayNames,
  fetchShopCards,
  fetchShopConsumptions,
  fetchShopRanks,
} from '@/lib/data/loyalty';
import { ShopRankSettingsForm } from '@/components/loyalty/ShopRankSettingsForm';
import { ShopOrdenForm } from '@/components/loyalty/ShopOrdenForm';
import { ShopCardsRegistry } from '@/components/loyalty/ShopCardsRegistry';
import { ShopLoyaltyAnalytics } from '@/components/loyalty/ShopLoyaltyAnalytics';
import type { Consumption, DepositCard, ShopRank } from '@/lib/types/loyalty';

export default function CafeLoyaltyPage() {
  const { cafeId } = useStaffSession();
  const shopId = cafeId ?? '';
  const [ranks, setRanks] = useState<ShopRank[] | null>(null);
  const [cards, setCards] = useState<DepositCard[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [guestNames, setGuestNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;

    fetchShopRanks(shopId).then((result) => {
      if (!cancelled) setRanks(result);
    });
    fetchShopCards(shopId).then((found) => {
      if (cancelled) return;
      setCards(found);
      void fetchGuestDisplayNames(found.map((c) => c.guestId)).then((names) => {
        if (!cancelled) setGuestNames((prev) => new Map([...prev, ...names]));
      });
    });
    fetchShopConsumptions(shopId).then((found) => {
      if (cancelled) return;
      setConsumptions(found);
      void fetchGuestDisplayNames(found.map((c) => c.guestId)).then((names) => {
        if (!cancelled) setGuestNames((prev) => new Map([...prev, ...names]));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  if (!shopId) return null;

  return (
    <div className="flex flex-col gap-12">
      {ranks === null ? (
        <p className="text-sm text-ink-400">Загрузка…</p>
      ) : (
        <ShopRankSettingsForm shopId={shopId} initialRanks={ranks} />
      )}

      {ranks !== null && <ShopOrdenForm shopId={shopId} ranks={ranks} />}

      <div>
        <p className="section-label mb-4">Карты гостей</p>
        <ShopCardsRegistry cards={cards} guestNames={guestNames} />
      </div>

      <div>
        <p className="section-label mb-4">Журнал чеков — сверка с кассой Yuma</p>
        <ShopLoyaltyAnalytics consumptions={consumptions} />
      </div>
    </div>
  );
}
