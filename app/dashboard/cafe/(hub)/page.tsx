'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import { setMenuLotActive, setMenuLotStatus, syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { useCafeLotBenchmarks } from '@/lib/data/useCafeLotBenchmarks';
import { useShopCheckins } from '@/lib/data/useShopCheckins';
import { LotMenuCard } from '@/components/cafe/LotMenuCard';
import { LotDetailModal } from '@/components/cafe/LotDetailModal';
import { CommunityHighlights } from '@/components/coffee/CommunityHighlights';
import { CatalogHierarchy } from '@/components/coffee/CatalogHierarchy';
import { useStaffSession } from '@/lib/auth/staffSession';

export default function CafeMenuPage() {
  const { cafeId } = useStaffSession();
  const activeShopId = cafeId ?? '';
  useEffect(() => {
    void syncCafeMenuFromSupabase(activeShopId);
  }, [activeShopId]);
  const lots = useLots();
  const menuEntries = useCafeMenuEntries(activeShopId);
  const menuLots = lots.filter((lot) => lot.id in menuEntries);
  const { benchmarks, loading: benchmarksLoading } = useCafeLotBenchmarks(activeShopId);
  const { records: shopRecords, loading: shopRecordsLoading } = useShopCheckins(activeShopId);
  const [openLotId, setOpenLotId] = useState<string | null>(null);
  const openLot = openLotId ? menuLots.find((lot) => lot.id === openLotId) ?? null : null;

  return (
    <>
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
        <CatalogHierarchy
          lots={menuLots}
          renderLot={(lot) => (
            <LotMenuCard
              lot={lot}
              isActive={menuEntries[lot.id]?.isActive ?? false}
              status={menuEntries[lot.id]?.status ?? 'active'}
              scheduledRemovalAt={menuEntries[lot.id]?.scheduledRemovalAt ?? null}
              onToggleActive={(next) => setMenuLotActive(activeShopId, lot.id, next)}
              onChangeStatus={(status, scheduledRemovalAt) => setMenuLotStatus(activeShopId, lot.id, status, scheduledRemovalAt)}
              discontinuedByRoaster={!lot.inRoasterCatalog}
              onOpenDetail={() => setOpenLotId(lot.id)}
            />
          )}
        />
      )}

      {openLot && (
        <LotDetailModal
          lot={openLot}
          shopId={activeShopId}
          shopRecords={shopRecords}
          shopRecordsLoading={shopRecordsLoading}
          benchmark={benchmarks.get(openLot.id)}
          benchmarkLoading={benchmarksLoading}
          isActive={menuEntries[openLot.id]?.isActive ?? false}
          status={menuEntries[openLot.id]?.status ?? 'active'}
          scheduledRemovalAt={menuEntries[openLot.id]?.scheduledRemovalAt ?? null}
          onToggleActive={(next) => setMenuLotActive(activeShopId, openLot.id, next)}
          onChangeStatus={(status, scheduledRemovalAt) => setMenuLotStatus(activeShopId, openLot.id, status, scheduledRemovalAt)}
          discontinuedByRoaster={!openLot.inRoasterCatalog}
          onClose={() => setOpenLotId(null)}
        />
      )}
    </>
  );
}
