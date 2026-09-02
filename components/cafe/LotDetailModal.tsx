'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getRoasterById } from '@/lib/data/roasters';
import { downloadLotQrPdf } from '@/lib/utils/qrPdf';
import type { LotBenchmark } from '@/lib/data/cafeLotBenchmarks';
import { DEFECT_TAGS, FLAVOR_AXES, type Lot, type TastingRecord } from '@/lib/types/coffee';
import { FlavorRadar } from '@/components/coffee/FlavorRadar';
import { StarRating } from '@/components/coffee/StarRating';
import { LotRatingBenchmarks } from './LotRatingBenchmarks';

type DetailTab = 'concept' | 'ratings' | 'defects';

function average(records: TastingRecord[], key: keyof TastingRecord['guestFlavorProfile']): number {
  if (records.length === 0) return 0;
  return records.reduce((sum, record) => sum + record.guestFlavorProfile[key], 0) / records.length;
}

function topDefects(records: TastingRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const defectId of record.defects) counts.set(defectId, (counts.get(defectId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([defectId, count]) => ({
      label: DEFECT_TAGS.find((tag) => tag.id === defectId)?.label ?? defectId,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// The lot card's own detail view — pulled out of the always-visible menu
// list (components/cafe/LotMenuCard.tsx) into a modal with button-tabs so a
// shop with a long menu doesn't have to scroll past every lot's full
// benchmark + defect breakdown just to find the toggle. "Задумка" is the
// roaster's own reference read (radar + descriptors), "Оценки"/"Дефекты"
// are this shop's own guest check-ins for the lot (see useShopCheckins).
export function LotDetailModal({
  lot,
  shopId,
  shopRecords,
  shopRecordsLoading,
  benchmark,
  benchmarkLoading,
  isActive,
  onToggleActive,
  discontinuedByRoaster,
  onClose,
}: {
  lot: Lot;
  shopId: string;
  shopRecords: TastingRecord[];
  shopRecordsLoading: boolean;
  benchmark?: LotBenchmark;
  benchmarkLoading: boolean;
  isActive: boolean;
  onToggleActive: (next: boolean) => void;
  discontinuedByRoaster: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('concept');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const roaster = getRoasterById(lot.roasterId);

  const lotRecords = useMemo(
    () => shopRecords.filter((record) => record.lotId === lot.id),
    [shopRecords, lot.id]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      await downloadLotQrPdf({
        lotId: lot.id,
        lotName: lot.name,
        roasterName: roaster?.name ?? 'Обжарщик',
        url: `${window.location.origin}/passport/${lot.id}`,
      });
    } finally {
      setDownloadingPdf(false);
    }
  }

  const roasterValues = FLAVOR_AXES.map(({ key }) => lot.roasterFlavorProfile[key]);
  const guestValues = FLAVOR_AXES.map(({ key }) => average(lotRecords, key));
  const avgRating =
    lotRecords.length > 0 ? lotRecords.reduce((sum, r) => sum + r.rating, 0) / lotRecords.length : 0;
  const defects = topDefects(lotRecords);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${lot.name} — карточка лота`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="font-display text-2xl text-ink-900 leading-tight">{lot.name}</h2>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
              {roaster?.name ?? 'Обжарщик не указан'}
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

        <div className="flex flex-wrap items-center gap-2 mt-3 mb-4">
          {lot.variety && (
            <span
              className="rounded-full border border-gold-400 text-gold-500 text-[11px]
                         uppercase tracking-widest2 px-2.5 py-1"
            >
              {lot.variety}
            </span>
          )}
          {lot.process && <span className="data-value text-[11px] text-ink-400">{lot.process}</span>}
          <span className="data-value text-[11px] text-ink-300">{lot.id}</span>
        </div>

        {discontinuedByRoaster && (
          <p
            className="inline-flex items-center rounded-full border border-dashed border-ink-300
                       bg-parchment-200 text-ink-500 text-[11px] px-2.5 py-1 mb-4"
          >
            Снято с производства обжарщиком — новые партии заказать нельзя
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-md border border-ink-200 bg-parchment-200 px-4 py-3 mb-6">
          <span className="text-sm text-ink-900">В меню кофейни</span>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label="В меню кофейни"
            onClick={() => onToggleActive(!isActive)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
                        transition-colors ${isActive ? 'bg-ink-900' : 'bg-ink-200'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-parchment-100
                          transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>

        <div role="tablist" aria-label="Раздел карточки лота" className="flex gap-1.5 mb-6">
          <DetailTabButton active={tab === 'concept'} onClick={() => setTab('concept')} label="Задумка" />
          <DetailTabButton active={tab === 'ratings'} onClick={() => setTab('ratings')} label="Оценки" />
          <DetailTabButton active={tab === 'defects'} onClick={() => setTab('defects')} label="Дефекты" />
        </div>

        {tab === 'concept' && (
          <div>
            <FlavorRadar
              series={[{ label: 'Обжарщик', color: 'var(--color-gold-500)', values: roasterValues }]}
              size={180}
            />
            <div className="flex items-center justify-center gap-4 mt-2 mb-5 text-xs text-ink-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gold-500 shrink-0" />
                Эталон обжарщика
              </span>
            </div>
            {lot.descriptors.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-ink-400 mb-2">Дескрипторы вкуса</p>
                <p className="text-sm text-ink-700">{lot.descriptors.join(' · ')}</p>
              </div>
            )}
            {lot.producer.story && (
              <div>
                <p className="text-xs text-ink-400 mb-2">История происхождения</p>
                <p className="text-sm text-ink-700">{lot.producer.story}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'ratings' && (
          <div>
            <LotRatingBenchmarks benchmark={benchmark} loading={benchmarkLoading} />
            {shopRecordsLoading ? (
              <p className="text-xs text-ink-400">Загрузка оценок гостей…</p>
            ) : lotRecords.length === 0 ? (
              <p className="text-xs text-ink-400">Пока нет дегустаций гостей этого лота в вашей кофейне.</p>
            ) : (
              <>
                <div className="flex items-center gap-6 mb-4">
                  <FlavorRadar
                    series={[
                      { label: 'Гости', color: 'var(--color-rating)', values: guestValues },
                      { label: 'Эталон', color: 'var(--color-gold-500)', values: roasterValues },
                    ]}
                    size={160}
                  />
                  <div>
                    <p className="text-xs text-ink-400 mb-1">Средняя оценка гостей</p>
                    <div className="mb-2">
                      <StarRating value={Math.round(avgRating)} label={`${avgRating.toFixed(1)} из 5`} />
                    </div>
                    <p className="text-xs text-ink-400">{lotRecords.length} дегустаций в этой кофейне</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-500">
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
              </>
            )}
          </div>
        )}

        {tab === 'defects' && (
          <div>
            {shopRecordsLoading ? (
              <p className="text-xs text-ink-400">Загрузка отзывов…</p>
            ) : defects.length === 0 ? (
              <p className="text-xs text-ink-400">Гости пока не отмечали дефектов у этого лота.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {defects.map((defect) => (
                  <li
                    key={defect.label}
                    className="rounded-full border border-ink-700 bg-ink-100 px-2.5 py-1.5
                               text-xs text-ink-900"
                  >
                    {defect.label} · {defect.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-8 pt-6 border-t border-ink-200">
          <Link
            href={`/dashboard/cafe/${lot.id}/edit`}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Редактировать
          </Link>
          <Link
            href={`/passport/${lot.id}?preview=1`}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Паспорт лота
          </Link>
          <Link
            href={`/dashboard/cafe/analytics?lotId=${lot.id}`}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Отзывы гостей
          </Link>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900
                       disabled:opacity-40 disabled:pointer-events-none"
          >
            {downloadingPdf ? 'Готовим PDF…' : 'Скачать QR (PDF)'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors
                  ${active ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium' : 'border-ink-200 text-ink-500'}`}
    >
      {label}
    </button>
  );
}
