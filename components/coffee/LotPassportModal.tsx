'use client';

import { useEffect } from 'react';
import type { Lot, TastingRecord } from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getRoasterById } from '@/lib/data/roasters';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from './StarRating';
import { ProducerRoasterCard } from './ProducerRoasterCard';

// Read-only lot passport reached from "Открыть паспорт лота →" in
// CoffeeJourney (Моё кофейное путешествие), for a lot the guest already
// tasted. Deliberately NOT a navigation to /passport/[lotId]: that route's
// whole job is the check-in flow (shop picker → BlindTastingLock → reveal),
// so reusing it here would re-trigger a "start a new tasting" gate instead
// of just showing what the guest already saved. This modal only ever reads
// existing TastingRecords — it has no path to creating one.
export function LotPassportModal({
  lot,
  records,
  onClose,
  onOpenRecord,
}: {
  lot: Lot;
  records: TastingRecord[]; // this guest's own records for this lot, any coffee shop
  onClose: () => void;
  onOpenRecord: (record: TastingRecord) => void;
}) {
  const roaster = getRoasterById(lot.roasterId);
  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${lot.name} — паспорт лота`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="font-display text-2xl text-ink-900 leading-tight">{lot.name}</h2>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
              {roaster?.name ?? 'Обжарщик'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-ink-300 mb-6">
          Только просмотр — исходный профиль обжарщика и ваша история дегустаций
        </p>

        <div className="mb-6">
          <ProducerRoasterCard lot={lot} />
        </div>

        <p className="section-label mb-3">
          Ваши дегустации и кофейни ({sortedRecords.length})
        </p>
        {sortedRecords.length === 0 ? (
          <p className="text-sm text-ink-400">Дегустаций этого лота пока не сохранено.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRecords.map((record) => {
              const shop = getCoffeeShopById(record.coffeeShopId);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecord(record)}
                    className="w-full flex items-center justify-between gap-3 rounded-md border
                               border-ink-200 bg-parchment-200 px-4 py-3 text-left hover:border-gold-400
                               transition-colors"
                  >
                    <div>
                      <p className="text-sm text-ink-900">
                        {shop?.name ?? record.coffeeShopId}
                        {shop?.city ? ` · ${shop.city}` : ''}
                      </p>
                      <p className="text-xs text-ink-400 mt-0.5">
                        {formatTastingDate(record.createdAt)}
                      </p>
                    </div>
                    <StarRating value={record.rating} label={`Оценка ${record.rating} из 5`} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
