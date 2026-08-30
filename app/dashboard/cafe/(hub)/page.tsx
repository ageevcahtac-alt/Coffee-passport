'use client';

import Link from 'next/link';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds } from '@/lib/data/useCafeMenu';
import { removeLotFromMenu } from '@/lib/data/cafeMenuStore';
import { LotMenuCard } from '@/components/cafe/LotMenuCard';
import { GuestFeedback } from '@/components/cafe/GuestFeedback';
import { CommunityHighlights } from '@/components/coffee/CommunityHighlights';

const ACTIVE_SHOP_ID = 'shop-xo-vsevolozhsk';

export default function CafeMenuPage() {
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(ACTIVE_SHOP_ID);
  const menuLots = lots.filter((lot) => menuLotIds.includes(lot.id));

  const regions = new Map<string, typeof menuLots>();
  for (const lot of menuLots) {
    const group = regions.get(lot.country) ?? [];
    group.push(lot);
    regions.set(lot.country, group);
  }
  const sortedRegions = Array.from(regions.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <GuestFeedback shopId={ACTIVE_SHOP_ID} />

      <CommunityHighlights scopeLots={menuLots} canApprove={false} />

      <div className="flex items-start justify-between gap-4 mb-8">
        <p className="section-label flex-1">Меню зерна по регионам</p>
        <Link
          href="/dashboard/cafe/add-lot"
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-5 py-3
                     hover:bg-ink-800 transition-colors shrink-0"
        >
          + Добавить лот в меню
        </Link>
      </div>

      {menuLots.length === 0 ? (
        <p className="text-ink-500 text-sm">
          В меню пока нет ни одного лота. Добавьте первый из каталога обжарщиков.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {sortedRegions.map(([country, lotsInRegion]) => (
            <div key={country}>
              <h2 className="font-display text-xl text-ink-900 mb-4">{country}</h2>
              <div className="flex flex-col gap-4">
                {lotsInRegion.map((lot) => (
                  <LotMenuCard
                    key={lot.id}
                    lot={lot}
                    onRemove={() => removeLotFromMenu(ACTIVE_SHOP_ID, lot.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
