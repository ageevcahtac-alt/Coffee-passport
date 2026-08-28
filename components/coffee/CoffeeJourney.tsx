'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TastingRecord } from '@/lib/types/coffee';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { TastingRecordCard } from './TastingRecordCard';
import { TastingDetailModal } from './TastingDetailModal';

export function CoffeeJourney({ records }: { records: TastingRecord[] }) {
  const [openRecord, setOpenRecord] = useState<TastingRecord | null>(null);

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

  // Records already come newest-first out of the store (see
  // lib/journey/store.ts) — grouping by the lot's country preserves that
  // order within each region, same grouping used for the roaster catalog on
  // /dashboard/cafe.
  const regions = new Map<string, TastingRecord[]>();
  for (const record of records) {
    const country = getMergedLotById(record.lotId)?.country ?? 'Другое';
    const group = regions.get(country) ?? [];
    group.push(record);
    regions.set(country, group);
  }
  const sortedRegions = Array.from(regions.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <div className="flex flex-col gap-10 max-w-md mx-auto w-full">
        {sortedRegions.map(([country, regionRecords]) => (
          <div key={country}>
            <h2 className="font-display text-xl text-ink-900 mb-4">{country}</h2>
            <div className="flex flex-col gap-4">
              {regionRecords.map((record) => (
                <TastingRecordCard
                  key={record.id}
                  record={record}
                  onClick={() => setOpenRecord(record)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {openRecord && (
        <TastingDetailModal record={openRecord} onClose={() => setOpenRecord(null)} />
      )}
    </>
  );
}
