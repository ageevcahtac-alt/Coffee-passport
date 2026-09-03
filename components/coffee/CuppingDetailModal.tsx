'use client';

import { useEffect } from 'react';
import { SENSORY_TAGS, type CuppingRecord } from '@/lib/types/coffee';
import { formatDate } from '@/lib/utils/date';

export function CuppingDetailModal({
  record,
  onClose,
  onDelete,
}: {
  record: CuppingRecord;
  onClose: () => void;
  onDelete?: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const origin = [record.originRegion, record.originCountry].filter(Boolean).join(', ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${record.beanName} — детали каппинга`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="font-display text-2xl text-ink-900 leading-tight">{record.beanName}</h2>
            {record.roasterName && (
              <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">{record.roasterName}</p>
            )}
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

        <p className="text-xs text-ink-300 mb-6">
          {formatDate(record.cuppingDate)}
          {record.location && ` · ${record.location}`}
        </p>

        {origin && (
          <div className="mb-6">
            <p className="section-label mb-2">Происхождение</p>
            <p className="text-sm text-ink-700">{origin}</p>
          </div>
        )}

        <p className="section-label mb-3">Характеристики</p>
        <div className="flex flex-col gap-2 mb-6">
          {[
            { label: 'Кислотность', value: record.acidity },
            { label: 'Тело / Плотность', value: record.body },
            { label: 'Яркость', value: record.brightness },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-ink-700">{label}</span>
              <span className="data-value text-ink-900">{value}/5</span>
            </div>
          ))}
        </div>

        {record.sensoryTags.length > 0 && (
          <>
            <p className="section-label mb-3">Аромат / Вкус</p>
            <ul className="flex flex-col gap-1.5 mb-6">
              {record.sensoryTags.map((tagId) => {
                const tag = SENSORY_TAGS.find((candidate) => candidate.id === tagId);
                const subs = record.subDescriptors[tagId];
                return (
                  <li key={tagId} className="text-sm text-ink-700">
                    {tag?.label ?? tagId}
                    {subs && subs.length > 0 && <span className="text-ink-400"> ({subs.join(', ')})</span>}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {record.liked && (
          <div className="mb-4">
            <p className="section-label mb-2">Понравилось</p>
            <p className="text-sm text-ink-700">{record.liked}</p>
          </div>
        )}

        {record.disliked && (
          <div className="mb-4">
            <p className="section-label mb-2">Не понравилось</p>
            <p className="text-sm text-ink-700">{record.disliked}</p>
          </div>
        )}

        {record.notes && (
          <div className="mb-6">
            <p className="section-label mb-2">Заметки</p>
            <p className="text-sm text-ink-700">{record.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-ink-200">
          <div>
            <p className="text-xs text-ink-400">Финальная оценка</p>
            <p className="data-value text-2xl text-gold-500">{record.finalScore.toFixed(2)}</p>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
            >
              Удалить запись
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
