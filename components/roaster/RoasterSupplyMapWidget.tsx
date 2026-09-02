'use client';

import Link from 'next/link';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import type { CoffeeShop, Lot } from '@/lib/types/coffee';

// "Карта поставок" — every accredited coffee shop currently listing at
// least one of this roaster's lots as active on their own menu (see
// lib/data/cafeMenuStore.ts's is_active_in_cafe). One row per shop, via
// useCafeMenuEntries(shop.id) — a per-shop hook, so this has to render one
// child per shop rather than looping the hook inside a single component.
export function RoasterSupplyMapWidget({ myLots }: { myLots: Lot[] }) {
  const shops = useCoffeeShops();
  const myLotIds = new Set(myLots.map((lot) => lot.id));

  if (myLotIds.size === 0) return null;

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="section-label mb-0">Карта поставок</p>
        <Link href="/map" className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900">
          Открыть карту →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {shops.map((shop) => (
          <ShopSupplyRow key={shop.id} shop={shop} myLots={myLots} myLotIds={myLotIds} />
        ))}
      </div>
    </div>
  );
}

function ShopSupplyRow({
  shop,
  myLots,
  myLotIds,
}: {
  shop: CoffeeShop;
  myLots: Lot[];
  myLotIds: Set<string>;
}) {
  const entries = useCafeMenuEntries(shop.id);
  const activeLotNames = myLots
    .filter((lot) => myLotIds.has(lot.id) && entries[lot.id])
    .map((lot) => lot.name);

  if (activeLotNames.length === 0) return null;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink-900">{shop.name}</p>
          <p className="text-xs text-ink-400 mt-0.5">{shop.city}</p>
        </div>
        <span className="data-value text-xs text-gold-500 shrink-0">
          {activeLotNames.length} {activeLotNames.length === 1 ? 'лот' : 'лотов'}
        </span>
      </div>
      <p className="text-xs text-ink-500 mt-1.5">{activeLotNames.join(' · ')}</p>
    </div>
  );
}
