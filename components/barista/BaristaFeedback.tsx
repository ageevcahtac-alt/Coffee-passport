'use client';

import { useShopCheckins } from '@/lib/data/useShopCheckins';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from '@/components/coffee/StarRating';
import { useStaffSession } from '@/lib/auth/staffSession';
import { DEFECT_TAGS, type TastingRecord } from '@/lib/types/coffee';

const FEED_LIMIT = 5;

// The barista's own dashboard read of guest feedback — same two-category
// split as components/cafe/GuestFeedback.tsx (☕ Кофе и экстракция / 👤
// Сервис и внешний вид), but scoped to cups THIS barista personally made
// (record.baristaId), not the whole shop. Every author is shown strictly
// as "NoName" — the guest's own identity is never collected in this flow
// to begin with (TastingRecord.userId is an opaque account/device id,
// never a display name), this label just makes that anonymity explicit
// rather than leaving the author line blank.
export function BaristaFeedback({ baristaId }: { baristaId: string }) {
  const { cafeId } = useStaffSession();
  const { records, loading } = useShopCheckins(cafeId ?? '');
  const myRecords = [...records]
    .filter((record) => record.baristaId === baristaId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const coffeeFeed = myRecords.slice(0, FEED_LIMIT);
  const serviceFeed = myRecords.filter((record) => record.baristaRating > 0).slice(0, FEED_LIMIT);

  return (
    <section className="mb-12">
      <p className="section-label mb-4">Отзывы гостей</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <h3 className="font-body font-medium text-sm text-ink-900 mb-1">☕ Кофе и экстракция</h3>
          <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-4">
            Вкус, баланс, дефекты заваривания
          </p>
          {loading ? (
            <p className="text-sm text-ink-400">Загрузка отзывов…</p>
          ) : coffeeFeed.length === 0 ? (
            <p className="text-sm text-ink-400">Пока нет отзывов о кофе.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {coffeeFeed.map((record) => (
                <CoffeeFeedItem key={record.id} record={record} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <h3 className="font-body font-medium text-sm text-ink-900 mb-1">👤 Сервис и внешний вид</h3>
          <p className="text-[11px] uppercase tracking-widest2 text-gold-500 mb-4">
            Приветливость, опрятность, атмосфера — видно только вам и кофейне
          </p>
          {loading ? (
            <p className="text-sm text-ink-400">Загрузка отзывов…</p>
          ) : serviceFeed.length === 0 ? (
            <p className="text-sm text-ink-400">Пока нет отзывов о сервисе.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {serviceFeed.map((record) => (
                <ServiceFeedItem key={record.id} record={record} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CoffeeFeedItem({ record }: { record: TastingRecord }) {
  const lot = getMergedLotById(record.lotId);
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
    </div>
  );
}

function ServiceFeedItem({ record }: { record: TastingRecord }) {
  return (
    <div className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <StarRating value={record.baristaRating} label={`Оценка сервиса ${record.baristaRating} из 5`} />
      </div>
      <p className="text-[11px] text-ink-300 mb-1.5">👤 NoName · Анонимный гость</p>
      {record.baristaNote && <p className="text-xs text-ink-500 mb-1">{record.baristaNote}</p>}
      <p className="text-[11px] text-ink-300 mt-1">{formatTastingDate(record.createdAt)}</p>
    </div>
  );
}
