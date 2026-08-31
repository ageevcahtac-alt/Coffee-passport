import { getMergedLotById } from '@/lib/data/lotsStore';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from '@/components/coffee/StarRating';
import { GuestTasteProfileWidget } from '@/components/coffee/GuestTasteProfileWidget';
import { ReviewReplyThread } from '@/components/shared/ReviewReplyThread';
import { DEFECT_TAGS, type TastingRecord } from '@/lib/types/coffee';

// Shared by the "Свежие отзывы" preview on the cafe dashboard home
// (components/cafe/GuestFeedback.tsx) and the full paginated archive
// (app/dashboard/cafe/(hub)/analytics/page.tsx) — same card, two
// different lists feeding it.
export function CoffeeReviewCard({
  record,
  allRecords,
  shopId,
}: {
  record: TastingRecord;
  allRecords: TastingRecord[];
  shopId: string;
}) {
  const lot = getMergedLotById(record.lotId);
  const shop = getCoffeeShopById(shopId);
  if (!lot) return null;

  return (
    <div className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-sm text-ink-900 font-medium leading-tight">{lot.name}</p>
        <StarRating value={record.rating} label={`Оценка кофе ${record.rating} из 5`} />
      </div>
      <p className="text-[11px] text-ink-300 mb-1.5">👤 NoName · Анонимный гость</p>
      {record.liked && <p className="text-xs text-ink-500 mb-1">👍 {record.liked}</p>}
      {record.disliked && <p className="text-xs text-ink-500 mb-1">👎 {record.disliked}</p>}
      {record.note && <p className="text-xs text-ink-500 mb-1">{record.note}</p>}
      {record.defects.length > 0 && (
        <p className="text-xs text-ink-900 mb-1">
          ⚠ Дефекты: {record.defects.map((id) => DEFECT_TAGS.find((tag) => tag.id === id)?.label ?? id).join(', ')}
        </p>
      )}
      <p className="text-[11px] text-ink-300 mt-1">{formatTastingDate(record.createdAt)}</p>

      <GuestTasteProfileWidget
        guestUserId={record.userId}
        allRecords={allRecords}
        currentLotProfile={lot.roasterFlavorProfile}
      />

      <ReviewReplyThread
        tastingRecordId={record.id}
        responderType="coffee_shop"
        responderId={shopId}
        responderName={shop?.name ?? 'Кофейня'}
      />
    </div>
  );
}
