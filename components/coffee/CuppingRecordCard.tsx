import type { CuppingRecord } from '@/lib/types/coffee';
import { formatDate } from '@/lib/utils/date';

export function CuppingRecordCard({
  record,
  onClick,
}: {
  record: CuppingRecord;
  onClick?: () => void;
}) {
  const origin = [record.originRegion, record.originCountry].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-ink-200 bg-parchment-100 p-5
                 hover:border-gold-400 transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="font-display text-xl text-ink-900 leading-tight">{record.beanName}</h3>
          {record.roasterName && (
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">{record.roasterName}</p>
          )}
        </div>
        <span className="data-value text-sm text-gold-500 shrink-0">{record.finalScore.toFixed(2)}</span>
      </div>

      {origin && <p className="text-sm text-ink-700 mb-1">{origin}</p>}
      <p className="text-sm text-ink-400 mb-3">
        {formatDate(record.cuppingDate)}
        {record.location && ` · ${record.location}`}
      </p>

      {(record.liked || record.disliked) && (
        <p className="text-sm text-ink-700 mb-2 line-clamp-2">{record.liked || record.disliked}</p>
      )}

      {record.sensoryTags.length > 0 && (
        <p className="text-xs text-ink-400">{record.sensoryTags.length} дескриптор(ов) вкуса</p>
      )}
    </button>
  );
}
