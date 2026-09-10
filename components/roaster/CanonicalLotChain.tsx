'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  findCanonicalLotByPublicId,
  getGreenLotById,
  getCoffeeById,
  listCanonicalLotsForGreenLot,
  describeCanonicalCoffee,
  describeCanonicalGreenLot,
  type CanonicalCoffee,
  type CanonicalGreenLot,
  type CanonicalLot,
} from '@/lib/data/canonicalLotStore';
import type { LotStatus } from '@/lib/types/database';

const STATUS_LABELS: Record<LotStatus, string> = {
  draft: 'Черновик',
  testing: 'Тестируется',
  active: 'Активен',
  archived: 'В архиве',
};

interface Chain {
  lot: CanonicalLot;
  greenLot: CanonicalGreenLot | null;
  coffee: CanonicalCoffee | null;
  siblingLots: CanonicalLot[];
}

// Read-only Coffee -> Green Lot -> Canonical Lot detail (Phase 4.5.3).
// Renders nothing but a quiet "not connected yet" note for a Lot with no
// canonical row (e.g. a purely local/seed Lot that predates Phase 4.5.1's
// backfill) — this component never fabricates a chain, only displays one
// that's actually there.
export function CanonicalLotChain({ publicId }: { publicId: string }) {
  // undefined = loading, null = this Lot has no canonical row.
  const [chain, setChain] = useState<Chain | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChain(undefined);
    setError(null);

    (async () => {
      try {
        const lot = await findCanonicalLotByPublicId(publicId);
        if (!lot) {
          if (!cancelled) setChain(null);
          return;
        }

        const [greenLot, siblingLots] = await Promise.all([
          getGreenLotById(lot.greenLotId),
          listCanonicalLotsForGreenLot(lot.greenLotId),
        ]);
        const coffee = greenLot ? await getCoffeeById(greenLot.coffeeId) : null;

        if (!cancelled) {
          setChain({
            lot,
            greenLot,
            coffee,
            siblingLots: siblingLots.filter((sibling) => sibling.id !== lot.id),
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить происхождение лота.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicId]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (chain === undefined) {
    return <p className="text-sm text-ink-400">Загрузка происхождения...</p>;
  }

  if (chain === null) {
    return (
      <p className="rounded-md border border-dashed border-ink-300 bg-parchment-100 p-4 text-xs text-ink-400">
        Этот лот ещё не связан с каноническим каталогом (Coffee → Green Lot → Lot).
      </p>
    );
  }

  const { lot, greenLot, coffee, siblingLots } = chain;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4 flex flex-col gap-3 text-xs text-ink-500">
      <div>
        <p className="section-label mb-1 text-ink-400">Canonical Lot</p>
        <p>
          <span className="data-value text-ink-700">{lot.publicId}</span>{' '}
          <span className="text-ink-400">· {STATUS_LABELS[lot.status]}</span>
          {!lot.inRoasterCatalog && <span className="text-ink-400"> · снят с обжарки</span>}
        </p>
        {(lot.qGrade != null || lot.roastProfileLabel) && (
          <p className="mt-1 text-ink-400">
            {lot.qGrade != null && <>Q-Score {lot.qGrade.toFixed(1)}</>}
            {lot.qGrade != null && lot.roastProfileLabel && ' · '}
            {lot.roastProfileLabel}
          </p>
        )}
      </div>

      <div>
        <p className="section-label mb-1 text-ink-400">Green Lot</p>
        {greenLot ? (
          <>
            <p>{describeCanonicalGreenLot(greenLot)}</p>
            {greenLot.notes && <p className="mt-1 text-ink-400">{greenLot.notes}</p>}
          </>
        ) : (
          <p className="text-ink-400">Не удалось загрузить партию.</p>
        )}
      </div>

      <div>
        <p className="section-label mb-1 text-ink-400">Coffee</p>
        {coffee ? (
          <>
            <p>{describeCanonicalCoffee(coffee)}</p>
            {(coffee.variety || coffee.processing || coffee.altitude || coffee.harvestYear) && (
              <p className="mt-1 text-ink-400">
                {[coffee.variety, coffee.processing, coffee.altitude, coffee.harvestYear].filter(Boolean).join(' · ')}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-400">Не удалось загрузить кофе.</p>
        )}
      </div>

      {siblingLots.length > 0 && (
        <div>
          <p className="section-label mb-1 text-ink-400">Другие лоты из этой партии</p>
          <ul className="flex flex-col gap-1">
            {siblingLots.map((sibling) => (
              <li key={sibling.id}>
                <Link
                  href={`/dashboard/roaster/${sibling.publicId}/edit`}
                  className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
                >
                  {sibling.publicId} — {sibling.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
