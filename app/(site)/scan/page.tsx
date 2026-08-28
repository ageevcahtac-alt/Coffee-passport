'use client';

import Link from 'next/link';
import { LOTS } from '@/lib/data/lots';
import { getRoasterById } from '@/lib/data/roasters';

// Demo scan flow: no camera yet. The QR normally encodes a lot id
// (LOT-XO-ETH-001) and resolves straight to /passport/[lotId] — this screen
// stands in for that resolution step so the rest of the flow can be built
// and tested before the camera scanner exists.
export default function ScanPage() {
  const [primaryLot, ...otherLots] = LOTS;
  const primaryRoaster = getRoasterById(primaryLot.roasterId);

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16 max-w-md mx-auto w-full">
      <p className="section-label mb-6">Сканировать кофе</p>

      <div
        className="aspect-square w-full rounded-md border border-dashed border-ink-200
                   bg-parchment-100 flex flex-col items-center justify-center gap-2 mb-4"
        aria-hidden="true"
      >
        <span className="text-4xl">▢</span>
        <span className="text-xs text-ink-400">Наведите камеру на QR-код лота</span>
      </div>

      <p className="text-xs text-ink-400 mb-10">
        Демо-режим: камера появится позже. Пока выберите лот вручную, как если бы его
        уже отсканировали.
      </p>

      <Link
        href={`/passport/${primaryLot.id}`}
        className="inline-flex flex-col items-start gap-1 rounded-md bg-ink-900
                   text-parchment-100 px-6 py-4 mb-6 hover:bg-ink-800 transition-colors"
      >
        <span className="text-xs uppercase tracking-widest2 text-parchment-300">
          Отсканировать демо-лот
        </span>
        <span className="font-body font-medium text-sm">
          {primaryLot.name} · {primaryRoaster?.name}
        </span>
      </Link>

      {otherLots.length > 0 && (
        <>
          <p className="section-label mb-4">Другие лоты для теста</p>
          <div className="flex flex-col gap-3">
            {otherLots.map((lot) => {
              const roaster = getRoasterById(lot.roasterId);
              return (
                <Link
                  key={lot.id}
                  href={`/passport/${lot.id}`}
                  className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-3
                             hover:bg-parchment-300 transition-colors"
                >
                  <span className="block text-sm text-ink-900">{lot.name}</span>
                  <span className="block text-xs text-ink-400">{roaster?.name}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
