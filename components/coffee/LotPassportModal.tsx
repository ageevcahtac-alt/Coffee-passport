'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { Lot, TastingRecord } from '@/lib/types/coffee';
import { SENSORY_TAGS } from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getRoasterById } from '@/lib/data/roasters';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from './StarRating';
import { ProducerRoasterCard } from './ProducerRoasterCard';
import { TasteComparison } from './TasteComparison';
import { ProfileCompareCarousel, type ComparePanel } from './ProfileCompareCarousel';

// "Моя оценка" panel content — the latest tasting's headline read plus every
// coffee shop/date this lot was checked in at (click one to open its full
// TastingDetailModal). When the guest hasn't tasted this lot yet, a single
// CTA replaces all of that: /passport/[lotId] already owns the full
// check-in → blind-tasting → reveal flow, so this just hands off to it
// rather than re-implementing any part of that gate here.
function MyRatingPanel({
  lot,
  records,
  onOpenRecord,
}: {
  lot: Lot;
  records: TastingRecord[]; // sorted newest-first
  onOpenRecord: (record: TastingRecord) => void;
}) {
  const latest = records[0] ?? null;

  if (!latest) {
    return (
      <div className="rounded-md border border-ink-200 bg-parchment-100 p-5 text-center">
        <p className="text-sm text-ink-700 mb-1">Вы ещё не дегустировали этот лот.</p>
        <p className="text-xs text-ink-400 mb-5">
          Отсканируйте его на кассе кофейни, чтобы записать личные впечатления.
        </p>
        <Link
          href={`/passport/${lot.id}`}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          Добавить мою дегустацию →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <p className="text-xs text-ink-400 mb-1.5">Последняя оценка чашки</p>
      <div className="mb-4">
        <StarRating value={latest.rating} label={`Оценка ${latest.rating} из 5`} />
      </div>

      {latest.sensoryTags.length > 0 && (
        <div className="mb-4">
          <p className="section-label mb-2">Дескрипторы</p>
          <p className="text-sm text-ink-700">
            {latest.sensoryTags
              .map((tagId) => SENSORY_TAGS.find((tag) => tag.id === tagId)?.label ?? tagId)
              .join(' · ')}
          </p>
        </div>
      )}

      {(latest.liked || latest.disliked) && (
        <div className="mb-5">
          {latest.liked && <p className="text-sm text-ink-700 mb-1">👍 {latest.liked}</p>}
          {latest.disliked && <p className="text-sm text-ink-500">👎 {latest.disliked}</p>}
        </div>
      )}

      <p className="section-label mb-2">Кофейни и даты ({records.length})</p>
      <ul className="flex flex-col gap-1.5">
        {records.map((record) => {
          const shop = getCoffeeShopById(record.coffeeShopId);
          return (
            <li key={record.id}>
              <button
                type="button"
                onClick={() => onOpenRecord(record)}
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
    </div>
  );
}

// Read-only lot passport reached from "Открыть паспорт лота →" in
// CoffeeJourney (Моё кофейное путешествие). Deliberately NOT a navigation to
// /passport/[lotId]: that route's whole job is the check-in flow (shop
// picker → BlindTastingLock → reveal), so reusing it here would re-trigger
// a "start a new tasting" gate instead of just showing what the guest
// already saved — except for the one deliberate exception in
// MyRatingPanel's empty state above, which hands off to that same route on
// purpose because there's nothing local to show yet.
//
// "Профиль обжарщика" / "Моя оценка" / "Сравнить" are laid out as one
// swipeable filmstrip (see ProfileCompareCarousel) instead of a long
// vertical stack, so the two profiles read as a single side-by-side
// comparison rather than two unrelated sections.
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
  const latestRecord = sortedRecords[0] ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const panels: ComparePanel[] = [
    { id: 'roaster', label: 'Профиль обжарщика', content: <ProducerRoasterCard lot={lot} /> },
    {
      id: 'mine',
      label: 'Моя оценка',
      content: <MyRatingPanel lot={lot} records={sortedRecords} onOpenRecord={onOpenRecord} />,
    },
  ];
  if (latestRecord) {
    panels.push({
      id: 'compare',
      label: 'Сравнить',
      content: <TasteComparison lot={lot} tasting={latestRecord} />,
    });
  }

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
          Эталонный профиль обжарщика и ваш личный опыт — листайте свайпом или переключайте вкладками
        </p>

        <ProfileCompareCarousel panels={panels} />
      </div>
    </div>
  );
}
