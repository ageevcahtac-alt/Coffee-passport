import { getBaristaById } from '@/lib/data/baristas';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from '@/components/coffee/StarRating';
import type { TastingRecord } from '@/lib/types/coffee';

// Shared by the "Свежие отзывы" preview on the cafe dashboard home
// (components/cafe/GuestFeedback.tsx) and the full paginated archive
// (app/dashboard/cafe/(hub)/analytics/page.tsx).
export function ServiceReviewCard({ record }: { record: TastingRecord }) {
  const barista = getBaristaById(record.baristaId);

  return (
    <div className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-sm text-ink-900 font-medium leading-tight">
          {barista?.name ?? 'Не указан'}
        </p>
        <StarRating
          value={record.baristaRating}
          label={`Оценка бариста ${record.baristaRating} из 5`}
        />
      </div>
      <p className="text-[11px] text-ink-300 mb-1.5">👤 NoName · Анонимный гость</p>
      {record.baristaNote && <p className="text-xs text-ink-500 mb-1">{record.baristaNote}</p>}
      <p className="text-[11px] text-ink-300 mt-1">{formatTastingDate(record.createdAt)}</p>
    </div>
  );
}
