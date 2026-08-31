'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getRoasterById } from '@/lib/data/roasters';
import { downloadLotQrPdf } from '@/lib/utils/qrPdf';
import type { Lot } from '@/lib/types/coffee';

export function LotMenuCard({ lot, onRemove }: { lot: Lot; onRemove: () => void }) {
  const roaster = getRoasterById(lot.roasterId);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="font-display text-lg text-ink-900 leading-tight">{lot.name}</h3>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
            {roaster?.name ?? 'Обжарщик не указан'}
          </p>
        </div>
        <span className="data-value text-sm text-gold-500 shrink-0">{lot.qGrade.toFixed(1)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
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

      <div className="flex flex-wrap gap-x-4 gap-y-2">
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
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          {downloadingPdf ? 'Готовим PDF…' : 'Скачать QR (PDF)'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-sm text-ink-400 underline underline-offset-2 hover:text-ink-700"
        >
          Убрать из меню
        </button>
      </div>
    </div>
  );
}
