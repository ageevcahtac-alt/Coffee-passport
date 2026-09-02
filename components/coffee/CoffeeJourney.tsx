'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TastingRecord } from '@/lib/types/coffee';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { formatTastingDate } from '@/lib/utils/date';
import { TastingDetailModal } from './TastingDetailModal';

// Groups the guest's own history by roaster first, then by lot within that
// roaster — per the enthusiast-profile redesign, replacing the old flat
// country-grouped feed. Clicking a roaster card reveals the lots tried from
// them; clicking a lot reveals every coffee shop/date it was checked in at
// (a lot can be tasted at more than one shop, or re-tasted at the same one).
export function CoffeeJourney({ records }: { records: TastingRecord[] }) {
  const [openRecord, setOpenRecord] = useState<TastingRecord | null>(null);
  const [openRoasterId, setOpenRoasterId] = useState<string | null>(null);
  const [openLotId, setOpenLotId] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-500 text-sm mb-6 max-w-xs mx-auto">
          Здесь появятся кофе, которые вы попробовали. Отсканируйте первый, чтобы начать
          свой путь.
        </p>
        <Link
          href="/scan"
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          Сканировать кофе
        </Link>
      </div>
    );
  }

  const roasterGroups = new Map<string, TastingRecord[]>();
  for (const record of records) {
    const group = roasterGroups.get(record.roasterId) ?? [];
    group.push(record);
    roasterGroups.set(record.roasterId, group);
  }
  const sortedRoasterIds = Array.from(roasterGroups.keys()).sort((a, b) => {
    const nameA = getRoasterById(a)?.name ?? a;
    const nameB = getRoasterById(b)?.name ?? b;
    return nameA.localeCompare(nameB);
  });

  return (
    <>
      <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
        {sortedRoasterIds.map((roasterId) => {
          const roaster = getRoasterById(roasterId);
          const roasterRecords = roasterGroups.get(roasterId) ?? [];
          const lotIds = Array.from(new Set(roasterRecords.map((record) => record.lotId)));
          const isRoasterOpen = openRoasterId === roasterId;

          return (
            <div
              key={roasterId}
              className="rounded-md border border-ink-200 bg-parchment-100 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenRoasterId(isRoasterOpen ? null : roasterId)}
                aria-expanded={isRoasterOpen}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <div>
                  <h2 className="font-display text-lg text-ink-900 leading-tight">
                    {roaster?.name ?? roasterId}
                  </h2>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {lotIds.length} лотов · {roasterRecords.length} дегустаций
                  </p>
                </div>
                <span
                  className={`text-ink-400 text-lg leading-none transition-transform shrink-0 ${
                    isRoasterOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>

              {isRoasterOpen && (
                <div className="flex flex-col gap-3 px-5 pb-5">
                  {lotIds.map((lotId) => {
                    const lot = getMergedLotById(lotId);
                    if (!lot) return null;
                    const lotRecords = roasterRecords
                      .filter((record) => record.lotId === lotId)
                      .sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      );
                    const isLotOpen = openLotId === lotId;

                    return (
                      <div key={lotId} className="rounded-md border border-ink-100 bg-parchment-200">
                        <button
                          type="button"
                          onClick={() => setOpenLotId(isLotOpen ? null : lotId)}
                          aria-expanded={isLotOpen}
                          className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-ink-900 leading-tight">{lot.name}</p>
                            <p className="text-xs text-ink-400 mt-0.5">
                              {lot.country} · {lot.region}
                            </p>
                          </div>
                          <span className="data-value text-xs text-gold-500 shrink-0">
                            {lot.qGrade.toFixed(1)}
                          </span>
                        </button>

                        {isLotOpen && (
                          <div className="px-4 pb-4">
                            <p className="text-xs text-ink-400 mb-2">Кофейни и даты дегустаций</p>
                            <ul className="flex flex-col gap-1.5 mb-3">
                              {lotRecords.map((record) => {
                                const shop = getCoffeeShopById(record.coffeeShopId);
                                return (
                                  <li key={record.id}>
                                    <button
                                      type="button"
                                      onClick={() => setOpenRecord(record)}
                                      className="w-full flex items-center justify-between gap-3 text-left
                                                 text-sm text-ink-700 hover:text-ink-900"
                                    >
                                      <span>
                                        {shop?.name ?? record.coffeeShopId}
                                        {shop?.city ? ` · ${shop.city}` : ''}
                                      </span>
                                      <span className="data-value text-xs text-ink-400 shrink-0">
                                        {formatTastingDate(record.createdAt)}
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            <Link
                              href={`/passport/${lot.id}`}
                              className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
                            >
                              Открыть паспорт лота →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {openRecord && (
        <TastingDetailModal record={openRecord} onClose={() => setOpenRecord(null)} />
      )}
    </>
  );
}
