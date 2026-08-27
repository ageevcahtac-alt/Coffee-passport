'use client';

import { useEffect } from 'react';
import { BREWING_METHODS, SENSORY_TAGS, type TastingRecord } from '@/lib/types/coffee';
import { getLotById } from '@/lib/data/lots';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getBaristaById } from '@/lib/data/baristas';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from './StarRating';
import { ProducerRoasterCard } from './ProducerRoasterCard';

export function TastingDetailModal({
  record,
  onClose,
}: {
  record: TastingRecord;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const lot = getLotById(record.lotId);
  const roaster = getRoasterById(record.roasterId);
  const shop = getCoffeeShopById(record.coffeeShopId);
  const barista = getBaristaById(record.baristaId);
  const brewingMethod = BREWING_METHODS.find((method) => method.id === record.brewingMethod);

  if (!lot || !roaster || !shop) return null;

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
        <div className="flex items-start justify-between gap-4 mb-1">
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

        <p className="text-xs text-ink-300 mb-6">Попробовано {formatTastingDate(record.createdAt)}</p>

        <p className="section-label mb-3">Кофейня и способ</p>
        <p className="text-sm text-ink-900 mb-1">
          {shop.name} · {shop.city}
        </p>
        <p className="text-sm text-ink-400 mb-6">{brewingMethod?.label ?? record.brewingMethod}</p>

        <p className="section-label mb-3">Оценка кофе</p>
        <div className="mb-6">
          <StarRating value={record.rating} label={`Оценка кофе ${record.rating} из 5`} />
        </div>

        {record.sensoryTags.length > 0 && (
          <>
            <p className="section-label mb-3">Вкусовые впечатления</p>
            <ul className="flex flex-wrap gap-2 mb-6">
              {record.sensoryTags.map((tagId) => {
                const tag = SENSORY_TAGS.find((candidate) => candidate.id === tagId);
                return (
                  <li
                    key={tagId}
                    className="rounded-full border border-ink-200 bg-parchment-200 px-3 py-1.5
                               text-xs text-ink-700"
                  >
                    {tag?.label ?? tagId}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {record.liked && (
          <div className="mb-4">
            <p className="section-label mb-2">Понравилось</p>
            <p className="text-sm text-ink-700">{record.liked}</p>
          </div>
        )}

        {record.disliked && (
          <div className="mb-4">
            <p className="section-label mb-2">Не понравилось</p>
            <p className="text-sm text-ink-700">{record.disliked}</p>
          </div>
        )}

        {record.note && (
          <div className="mb-6">
            <p className="section-label mb-2">Заметки</p>
            <p className="text-sm text-ink-700">{record.note}</p>
          </div>
        )}

        <p className="section-label mb-3">Бариста</p>
        <div className="mb-6">
          <p className="text-sm text-ink-900 mb-2">{barista?.name ?? 'Не указан'}</p>
          {record.baristaRating > 0 && (
            <div className="mb-2">
              <StarRating
                value={record.baristaRating}
                label={`Оценка бариста ${record.baristaRating} из 5`}
              />
            </div>
          )}
          {record.baristaNote && <p className="text-sm text-ink-700">{record.baristaNote}</p>}
        </div>

        <p className="section-label mb-3">Происхождение и обжарка</p>
        <ProducerRoasterCard lot={lot} />
      </div>
    </div>
  );
}
