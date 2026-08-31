'use client';

import { useMemo, useState } from 'react';
import { DEFECT_TAGS, FLAVOR_AXES, SENSORY_TAGS, type Lot } from '@/lib/types/coffee';
import { getRoasterById } from '@/lib/data/roasters';
import type { AnonymizedCheckin } from '@/lib/data/checkinsRoasterView';
import { formatTastingDate } from '@/lib/utils/date';
import { FlavorRadar } from '@/components/coffee/FlavorRadar';
import { StarRating } from '@/components/coffee/StarRating';
import { ReviewReplyThread } from '@/components/shared/ReviewReplyThread';

function average(checkins: AnonymizedCheckin[], key: (typeof FLAVOR_AXES)[number]['key']): number {
  if (checkins.length === 0) return 0;
  return checkins.reduce((sum, checkin) => sum + checkin.guestFlavorProfile[key], 0) / checkins.length;
}

function topSensoryTags(checkins: AnonymizedCheckin[], limit = 5) {
  const counts = new Map<string, number>();
  for (const checkin of checkins) {
    for (const tagId of checkin.sensoryTags) {
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

function topDefects(checkins: AnonymizedCheckin[]) {
  const counts = new Map<string, number>();
  for (const checkin of checkins) {
    for (const defectId of checkin.defects) {
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

// The "Шкала предпочтений гостей" on the roaster's own lot card — sourced
// from public.checkins_roaster_view (see lib/data/checkinsRoasterView.ts
// and supabase/migrations/0007_staff_profiles_rls.sql), NOT the shared
// local journey store guests/staff read. That view only ever exposes
// grain/extraction/flavor data (rating, guestFlavorProfile, sensory tags,
// defects, liked/disliked/note) for this roaster's own lots — no guest
// identity, no coffee-shop identity, and structurally no
// barista_id/barista_rating/barista_note columns at all, so there is no
// code path here that could render service/staff feedback even by
// mistake. That's also why the old per-shop filter and per-guest "taste
// profile" cross-reference are gone: both needed data this view
// deliberately doesn't carry.
export function LotGuestAnalytics({
  lot,
  checkins,
  loading,
}: {
  lot: Lot;
  checkins: AnonymizedCheckin[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  const lotCheckins = useMemo(() => checkins.filter((checkin) => checkin.lotId === lot.id), [checkins, lot.id]);

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-ink-100">
        <p className="section-label mb-0">Шкала предпочтений гостей</p>
        <p className="text-xs text-ink-400 mt-3">Загрузка отзывов гостей…</p>
      </div>
    );
  }

  if (lotCheckins.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-ink-100">
        <p className="section-label mb-0">Шкала предпочтений гостей</p>
        <p className="text-xs text-ink-400 mt-3">Пока нет дегустаций гостей для этого лота.</p>
      </div>
    );
  }

  const guestValues = FLAVOR_AXES.map(({ key }) => average(lotCheckins, key));
  const roasterValues = FLAVOR_AXES.map(({ key }) => lot.roasterFlavorProfile[key]);
  const avgRating = lotCheckins.reduce((sum, c) => sum + c.rating, 0) / lotCheckins.length;
  const topTags = topSensoryTags(lotCheckins);
  const defects = topDefects(lotCheckins);

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="section-label mb-0 flex-1">Шкала предпочтений гостей</span>
        <span className="data-value text-xs text-ink-400 shrink-0 ml-3">
          {lotCheckins.length} · {open ? 'скрыть ▲' : 'показать ▼'}
        </span>
      </button>

      {open && (
        <div className="mt-4">
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
              <p className="text-xs text-ink-400">{lotCheckins.length} дегустаций</p>
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
            <p className="text-xs text-ink-400 mb-3">Отзывы гостей ({lotCheckins.length})</p>
            <div className="flex flex-col gap-4">
              {lotCheckins.map((checkin) => (
                <GuestReviewItem key={checkin.id} lot={lot} checkin={checkin} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuestReviewItem({ lot, checkin }: { lot: Lot; checkin: AnonymizedCheckin }) {
  const roaster = getRoasterById(lot.roasterId);

  return (
    <div className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-[11px] uppercase tracking-widest2 text-ink-300">Анонимный гость</p>
        <StarRating value={checkin.rating} label={`Оценка кофе ${checkin.rating} из 5`} />
      </div>
      {checkin.liked && <p className="text-xs text-ink-500 mb-1">👍 {checkin.liked}</p>}
      {checkin.disliked && <p className="text-xs text-ink-500 mb-1">👎 {checkin.disliked}</p>}
      {checkin.note && <p className="text-xs text-ink-500 mb-1">{checkin.note}</p>}
      <p className="text-[11px] text-ink-300 mt-1">{formatTastingDate(checkin.createdAt)}</p>

      <ReviewReplyThread
        tastingRecordId={checkin.id}
        responderType="roaster"
        responderId={lot.roasterId}
        responderName={roaster?.name ?? 'Обжарщик'}
      />
    </div>
  );
}
