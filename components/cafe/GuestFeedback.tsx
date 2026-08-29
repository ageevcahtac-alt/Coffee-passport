'use client';

import { useJourney } from '@/lib/journey/useJourney';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getBaristaById } from '@/lib/data/baristas';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from '@/components/coffee/StarRating';
import { GuestTasteProfileWidget } from '@/components/coffee/GuestTasteProfileWidget';
import { ReviewReplyThread } from '@/components/shared/ReviewReplyThread';
import { DEFECT_TAGS, type TastingRecord } from '@/lib/types/coffee';

const FEED_LIMIT = 5;

// Guest feedback splits into two audiences from one shared record: coffee
// impressions (rating, liked/disliked, notes) that the roaster also cares
// about, and staff impressions (barista rating/note) that stay shop-only.
// Both read the same TastingRecord — see lib/types/coffee.ts — just slice
// different fields.
export function GuestFeedback({ shopId }: { shopId: string }) {
  const records = useJourney();
  const shopRecords = [...records]
    .filter((record) => record.coffeeShopId === shopId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const coffeeFeed = shopRecords.slice(0, FEED_LIMIT);
  const staffFeed = shopRecords.filter((record) => record.baristaRating > 0).slice(0, FEED_LIMIT);

  return (
    <section className="mb-12">
      <p className="section-label mb-4">Свежие отзывы гостей</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-body font-medium text-sm text-ink-900">☕ Отзывы по кофе</h3>
          </div>
          <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-4">
            Видит кофейня и обжарщик
          </p>
          {coffeeFeed.length === 0 ? (
            <p className="text-sm text-ink-400">Пока нет отзывов о кофе.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {coffeeFeed.map((record) => (
                <CoffeeFeedItem key={record.id} record={record} allRecords={records} shopId={shopId} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-body font-medium text-sm text-ink-900">👤 Отзывы по персоналу</h3>
          </div>
          <p className="text-[11px] uppercase tracking-widest2 text-gold-500 mb-4">
            Видно только кофейне
          </p>
          {staffFeed.length === 0 ? (
            <p className="text-sm text-ink-400">Пока нет отзывов о персонале.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {staffFeed.map((record) => (
                <StaffFeedItem key={record.id} record={record} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CoffeeFeedItem({
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

function StaffFeedItem({ record }: { record: TastingRecord }) {
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
      {record.baristaNote && <p className="text-xs text-ink-500 mb-1">{record.baristaNote}</p>}
      <p className="text-[11px] text-ink-300 mt-1">{formatTastingDate(record.createdAt)}</p>
    </div>
  );
}
