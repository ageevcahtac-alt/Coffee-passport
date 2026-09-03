'use client';

import { useEffect } from 'react';
import type { TastingRecord } from '@/lib/types/coffee';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getRoasterById } from '@/lib/data/roasters';
import { UNSPECIFIED_BARISTA_ID } from '@/lib/data/baristas';
import { ProducerRoasterCard } from './ProducerRoasterCard';
import { RoasterCafeRecommendations } from './RoasterCafeRecommendations';
import { TastingRecordDetails } from './TastingRecordDetails';

export function TastingDetailModal({
  record,
  onClose,
}: {
  record: TastingRecord;
  onClose: () => void;
}) {
  // This modal only ever opens on the current user's own tasting record —
  // reached from /journey or the CoffeeJourney feed, both already scoped to
  // the signed-in/anonymous-device user — so the record's own userId IS the
  // current user, no separate prop needed.
  const currentUserId = record.userId;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const lot = getMergedLotById(record.lotId);
  const roaster = getRoasterById(record.roasterId);

  if (!lot || !roaster) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${lot.name} — детали дегустации`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl text-ink-900 leading-tight">{lot.name}</h2>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">{roaster.name}</p>
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

        <TastingRecordDetails record={record} />

        <div className="mt-6">
          <p className="section-label mb-3">Рецепт для этого способа</p>
          <RoasterCafeRecommendations
            lot={lot}
            roaster={roaster}
            shopId={record.coffeeShopId}
            baristaId={record.baristaId !== UNSPECIFIED_BARISTA_ID ? record.baristaId : null}
            brewingMethodId={record.brewingMethod}
            currentUserId={currentUserId}
            currentUserName="Вы"
          />
        </div>

        <div className="mt-6">
          <p className="section-label mb-3">Происхождение и обжарка</p>
          <ProducerRoasterCard lot={lot} />
        </div>
      </div>
    </div>
  );
}
