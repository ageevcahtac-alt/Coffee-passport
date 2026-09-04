'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds, useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import { syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { CatalogHierarchy } from '@/components/coffee/CatalogHierarchy';
import { GuestLotPreviewCard } from '@/components/coffee/GuestLotPreviewCard';
import { ShopMuteToggle } from '@/components/coffee/ShopMuteToggle';
import type { RoastType } from '@/lib/types/coffee';

// The guest-facing, read-only "Меню кофейни" — the enthusiast side of the
// same 3-level catalog the roaster and cafe dashboards use
// (components/coffee/CatalogHierarchy.tsx), scoped to one shop's current
// active menu. Reached from CoffeeShopProfileCard's "Смотреть меню
// кофейни" link, or from a "Обновления на баре" announcement
// (components/coffee/BarUpdatesPanel.tsx), which passes ?country=&roastType=
// so the click lands straight on the level-3 lot list instead of the
// level-1 default.
export default function ShopMenuPage({ params }: { params: { shopId: string } }) {
  const shop = getCoffeeShopById(params.shopId);
  const searchParams = useSearchParams();
  const initialCountry = searchParams.get('country');
  const initialRoastType = searchParams.get('roastType') as RoastType | null;

  useEffect(() => {
    void syncCafeMenuFromSupabase(params.shopId);
  }, [params.shopId]);

  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(params.shopId);
  const entries = useCafeMenuEntries(params.shopId);
  const menuLots = lots.filter((lot) => menuLotIds.includes(lot.id));

  if (!shop) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Кофейня не найдена</h1>
        <p className="text-ink-500 text-sm">Проверьте ссылку.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2.5 mb-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: shop.brandColor }}
            aria-hidden="true"
          />
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body">{shop.city}</p>
        </div>
        <h1 className="font-display text-3xl text-ink-900 mb-6">{shop.name}</h1>

        <div className="mb-10">
          <ShopMuteToggle shopId={params.shopId} />
        </div>

        {menuLots.length === 0 ? (
          <p className="text-ink-500 text-sm">Меню кофейни пока не заполнено.</p>
        ) : (
          <CatalogHierarchy
            lots={menuLots}
            initialCountry={initialCountry}
            initialRoastType={initialRoastType}
            renderLot={(lot) => (
              <GuestLotPreviewCard lot={lot} status={entries[lot.id]?.status ?? 'active'} />
            )}
          />
        )}
      </div>
    </main>
  );
}
