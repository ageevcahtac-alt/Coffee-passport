'use client';

import { useEffect, useState } from 'react';
import { useStaffSession } from '@/lib/auth/staffSession';
import {
  fetchGuestDisplayNames,
  fetchShopRanks,
  fetchShopSubscriptions,
  fetchShopTransactions,
} from '@/lib/data/loyalty';
import { ShopRankSettingsForm } from '@/components/loyalty/ShopRankSettingsForm';
import { ShopSubscriptionsRegistry } from '@/components/loyalty/ShopSubscriptionsRegistry';
import { ShopLoyaltyAnalytics } from '@/components/loyalty/ShopLoyaltyAnalytics';
import type { LoyaltyTransaction, ShopRank, Subscription } from '@/lib/types/loyalty';

export default function CafeLoyaltyPage() {
  const { cafeId } = useStaffSession();
  const shopId = cafeId ?? '';
  const [ranks, setRanks] = useState<ShopRank[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [guestNames, setGuestNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;

    fetchShopRanks(shopId).then((result) => {
      if (!cancelled) setRanks(result);
    });
    fetchShopSubscriptions(shopId).then((subs) => {
      if (cancelled) return;
      setSubscriptions(subs);
      void fetchGuestDisplayNames(subs.map((s) => s.guestId)).then((names) => {
        if (!cancelled) setGuestNames((prev) => new Map([...prev, ...names]));
      });
    });
    fetchShopTransactions(shopId).then((txs) => {
      if (cancelled) return;
      setTransactions(txs);
      void fetchGuestDisplayNames(txs.map((t) => t.guestId)).then((names) => {
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

      <div>
        <p className="section-label mb-4">Активные абонементы</p>
        <ShopSubscriptionsRegistry subscriptions={subscriptions} guestNames={guestNames} />
      </div>

      <div>
        <p className="section-label mb-4">Аналитика — сверка с кассой Yuma</p>
        <ShopLoyaltyAnalytics transactions={transactions} />
      </div>
    </div>
  );
}
