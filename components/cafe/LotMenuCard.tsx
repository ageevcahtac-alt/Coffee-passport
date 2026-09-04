'use client';

import { getRoasterById } from '@/lib/data/roasters';
import type { Lot, LotMenuStatus } from '@/lib/types/coffee';
import { LotStatusControl } from './LotStatusControl';

// Deliberately compact — the full benchmark/rating/defect breakdown for a
// lot now lives in LotDetailModal (opened via onOpenDetail), so a shop with
// a long menu scans a short list here instead of scrolling past every lot's
// full stats just to find the "В меню кофейни" toggle, which stays inline
// since it's the one action worth a single click from the list.
export function LotMenuCard({
  lot,
  isActive,
  onToggleActive,
  status,
  onChangeStatus,
  discontinuedByRoaster = false,
  onOpenDetail,
}: {
  lot: Lot;
  isActive: boolean;
  onToggleActive: (next: boolean) => void;
  status: LotMenuStatus;
  onChangeStatus: (status: LotMenuStatus) => void;
  discontinuedByRoaster?: boolean;
  onOpenDetail: () => void;
}) {
  const roaster = getRoasterById(lot.roasterId);

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <button type="button" onClick={onOpenDetail} className="w-full text-left">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="font-display text-lg text-ink-900 leading-tight">{lot.name}</h3>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
              {roaster?.name ?? 'Обжарщик не указан'}
            </p>
          </div>
          <span className="data-value text-sm text-gold-500 shrink-0">{lot.qGrade.toFixed(1)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
      </button>

      {discontinuedByRoaster && (
        <p
          className="inline-flex items-center rounded-full border border-dashed border-ink-300
                     bg-parchment-200 text-ink-500 text-[11px] px-2.5 py-1 mt-4"
        >
          Снято с производства обжарщиком
        </p>
      )}

      <div className="flex items-center justify-between gap-4 rounded-md border border-ink-200 bg-parchment-200 px-4 py-3 mt-4">
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

      {isActive && (
        <div className="mt-4">
          <LotStatusControl value={status} onChange={onChangeStatus} />
        </div>
      )}

      <button
        type="button"
        onClick={onOpenDetail}
        className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-3"
      >
        Подробнее — Задумка / Оценки / Дефекты →
      </button>
    </div>
  );
}
