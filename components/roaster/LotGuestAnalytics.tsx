'use client';

import { useMemo, useState } from 'react';
import { DEFECT_TAGS, FLAVOR_AXES, SENSORY_TAGS, type Lot, type TastingRecord } from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getRoasterById } from '@/lib/data/roasters';
import { formatTastingDate } from '@/lib/utils/date';
import { FlavorRadar } from '@/components/coffee/FlavorRadar';
import { StarRating } from '@/components/coffee/StarRating';
import { GuestTasteProfileWidget } from '@/components/coffee/GuestTasteProfileWidget';
import { ReviewReplyThread } from '@/components/shared/ReviewReplyThread';

function average(records: TastingRecord[], key: (typeof FLAVOR_AXES)[number]['key']): number {
  if (records.length === 0) return 0;
  return records.reduce((sum, record) => sum + record.guestFlavorProfile[key], 0) / records.length;
}

function topSensoryTags(records: TastingRecord[], limit = 5) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const tagId of record.sensoryTags) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tagId, count]) => ({
      label: SENSORY_TAGS.find((tag) => tag.id === tagId)?.label ?? tagId,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function topDefects(records: TastingRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const defectId of record.defects) {
      counts.set(defectId, (counts.get(defectId) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([defectId, count]) => ({
      label: DEFECT_TAGS.find((tag) => tag.id === defectId)?.label ?? defectId,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// Every guest's blind-cupping read (guestFlavorProfile, rating, sensory
// tags — see TastingRecord in lib/types/coffee.ts) feeds this straight from
// the shared journey store, no separate analytics pipeline: this is the
// "Шкала предпочтений гостей" on the roaster's own lot card, averaged
// across all shops by default with an optional per-shop breakdown.
export function LotGuestAnalytics({ lot, records }: { lot: Lot; records: TastingRecord[] }) {
  const [open, setOpen] = useState(false);
  const [shopFilter, setShopFilter] = useState<string>('all');

  const lotRecords = useMemo(
    () => records.filter((record) => record.lotId === lot.id),
    [records, lot.id]
  );

  const shopIds = useMemo(
    () => Array.from(new Set(lotRecords.map((record) => record.coffeeShopId))),
    [lotRecords]
  );

  if (lotRecords.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-ink-100">
        <p className="section-label mb-0">Шкала предпочтений гостей</p>
        <p className="text-xs text-ink-400 mt-3">Пока нет дегустаций гостей для этого лота.</p>
      </div>
    );
  }

  const filteredRecords =
    shopFilter === 'all' ? lotRecords : lotRecords.filter((record) => record.coffeeShopId === shopFilter);

  const guestValues = FLAVOR_AXES.map(({ key }) => average(filteredRecords, key));
  const roasterValues = FLAVOR_AXES.map(({ key }) => lot.roasterFlavorProfile[key]);
  const avgRating = filteredRecords.reduce((sum, r) => sum + r.rating, 0) / filteredRecords.length;
  const topTags = topSensoryTags(filteredRecords);
  const defects = topDefects(filteredRecords);

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="section-label mb-0 flex-1">Шкала предпочтений гостей</span>
        <span className="data-value text-xs text-ink-400 shrink-0 ml-3">
          {lotRecords.length} · {open ? 'скрыть ▲' : 'показать ▼'}
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {shopIds.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              <FilterPill
                active={shopFilter === 'all'}
                onClick={() => setShopFilter('all')}
                label={`Все кофейни (${lotRecords.length})`}
              />
              {shopIds.map((shopId) => {
                const shop = getCoffeeShopById(shopId);
                const count = lotRecords.filter((record) => record.coffeeShopId === shopId).length;
                return (
                  <FilterPill
                    key={shopId}
                    active={shopFilter === shopId}
                    onClick={() => setShopFilter(shopId)}
                    label={`${shop?.name ?? shopId} (${count})`}
                  />
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-6 mb-4">
            <FlavorRadar
              series={[
                { label: 'Гости', color: 'var(--color-rating)', values: guestValues },
                { label: 'Эталон', color: 'var(--color-gold-500)', values: roasterValues },
              ]}
              size={180}
            />
            <div className="flex-1">
              <p className="text-xs text-ink-400 mb-1">Средняя оценка гостей</p>
              <p className="data-value text-2xl text-ink-900 mb-3">
                {avgRating.toFixed(1)}
                <span className="text-xs text-ink-400">/5</span>
              </p>
              <p className="text-xs text-ink-400">{filteredRecords.length} дегустаций</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-rating)' }}
              />
              Гости
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gold-500 shrink-0" />
              Эталон обжарщика
            </span>
          </div>

          {topTags.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-ink-400 mb-2">Гости часто отмечают</p>
              <ul className="flex flex-wrap gap-1.5">
                {topTags.map((tag) => (
                  <li
                    key={tag.label}
                    className="rounded-full border border-ink-200 bg-parchment-200 px-2.5 py-1
                               text-[11px] text-ink-700"
                  >
                    {tag.label} · {tag.count}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {defects.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-ink-400 mb-2">
                ⚠ Отмеченные дефекты — возможна проблема экстракции или сырья
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {defects.map((defect) => (
                  <li
                    key={defect.label}
                    className="rounded-full border border-ink-700 bg-ink-100 px-2.5 py-1
                               text-[11px] text-ink-900"
                  >
                    {defect.label} · {defect.count}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-4 border-t border-ink-100">
            <p className="text-xs text-ink-400 mb-3">Отзывы гостей ({filteredRecords.length})</p>
            <div className="flex flex-col gap-4">
              {filteredRecords.map((record) => (
                <GuestReviewItem key={record.id} lot={lot} record={record} allRecords={lotRecords} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuestReviewItem({
  lot,
  record,
  allRecords,
}: {
  lot: Lot;
  record: TastingRecord;
  allRecords: TastingRecord[];
}) {
  const shop = getCoffeeShopById(record.coffeeShopId);
  const roaster = getRoasterById(lot.roasterId);

  return (
    <div className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-sm text-ink-900 font-medium leading-tight">{shop?.name ?? record.coffeeShopId}</p>
        <StarRating value={record.rating} label={`Оценка кофе ${record.rating} из 5`} />
      </div>
      {record.liked && <p className="text-xs text-ink-500 mb-1">👍 {record.liked}</p>}
      {record.disliked && <p className="text-xs text-ink-500 mb-1">👎 {record.disliked}</p>}
      {record.note && <p className="text-xs text-ink-500 mb-1">{record.note}</p>}
      <p className="text-[11px] text-ink-300 mt-1">{formatTastingDate(record.createdAt)}</p>

      <GuestTasteProfileWidget
        guestUserId={record.userId}
        allRecords={allRecords}
        currentLotProfile={lot.roasterFlavorProfile}
      />

      <ReviewReplyThread
        tastingRecordId={record.id}
        responderType="roaster"
        responderId={lot.roasterId}
        responderName={roaster?.name ?? 'Обжарщик'}
      />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors
                  ${active
                    ? 'border-gold-400 bg-gold-400/10 text-ink-900'
                    : 'border-ink-200 text-ink-500'}`}
    >
      {label}
    </button>
  );
}
