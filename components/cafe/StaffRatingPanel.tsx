'use client';

import { useJourney } from '@/lib/journey/useJourney';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { formatDate } from '@/lib/utils/date';
import { StarRating } from '@/components/coffee/StarRating';
import type { TastingRecord } from '@/lib/types/coffee';

function pluralizeVotes(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'оценка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'оценки';
  return 'оценок';
}

// Guest ratings for a staff member come straight out of the same
// TastingRecord data the "coffee vs staff" split on the dashboard home uses
// (see components/cafe/GuestFeedback.tsx) — just filtered down to one
// baristaId instead of one shop, since a card here is scoped to one person.
export function StaffRatingPanel({ staffId }: { staffId: string }) {
  const records = useJourney();
  const rated = [...records]
    .filter((record) => record.baristaId === staffId && record.baristaRating > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = rated.length;
  const average = total > 0 ? rated.reduce((sum, r) => sum + r.baristaRating, 0) / total : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rated.filter((record) => record.baristaRating === star).length,
  }));

  return (
    <>
      <p className="section-label mb-4">Оценки гостей</p>
      {total === 0 ? (
        <p className="text-ink-500 text-sm mb-10">Пока нет оценок от гостей.</p>
      ) : (
        <div className="mb-10">
          <div className="flex items-baseline gap-4 mb-5">
            <span className="font-display text-4xl text-gold-500">{average.toFixed(1)}</span>
            <div>
              <StarRating
                value={Math.round(average)}
                label={`Средняя оценка ${average.toFixed(1)} из 5`}
              />
              <p className="text-xs text-ink-400 mt-1">
                {total} {pluralizeVotes(total)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {distribution.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-3">
                <span className="data-value text-xs text-ink-400 w-8 shrink-0">{star} ★</span>
                <div className="flex-1 h-2 rounded-full bg-parchment-300 overflow-hidden">
                  <div
                    className="h-full bg-gold-400"
                    style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="data-value text-xs text-ink-400 w-6 text-right shrink-0">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="section-label mb-4">Отзывы гостей о сотруднике</p>
      {rated.length === 0 ? (
        <p className="text-ink-500 text-sm">Пока нет отзывов.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rated.map((record) => (
            <ReviewItem key={record.id} record={record} />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewItem({ record }: { record: TastingRecord }) {
  const lot = getMergedLotById(record.lotId);

  return (
    <div className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-sm text-ink-900 font-medium leading-tight">{lot?.name ?? 'Кофе'}</p>
        <StarRating value={record.baristaRating} label={`Оценка ${record.baristaRating} из 5`} />
      </div>
      <p className="text-[11px] text-ink-300 mb-1">👤 NoName · Анонимный гость</p>
      <p className="text-xs text-ink-500 mb-1">{record.baristaNote || 'Без комментария.'}</p>
      <p className="text-[11px] text-ink-300 mt-1">{formatDate(record.createdAt)}</p>
    </div>
  );
}
