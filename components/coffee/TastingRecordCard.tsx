import type { TastingRecord } from '@/lib/types/coffee';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { formatTastingDate } from '@/lib/utils/date';
import { summarizeTasting } from '@/lib/utils/tastingSummary';
import { StarRating } from './StarRating';

export function TastingRecordCard({
  record,
  onClick,
}: {
  record: TastingRecord;
  onClick?: () => void;
}) {
  const lot = getMergedLotById(record.lotId);
  const roaster = getRoasterById(record.roasterId);
  const shop = getCoffeeShopById(record.coffeeShopId);
  const brewingMethod = BREWING_METHODS.find((method) => method.id === record.brewingMethod);
  const summary = summarizeTasting(record);

  if (!lot || !roaster || !shop) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-ink-200 bg-parchment-100 p-5
                 hover:border-gold-400 transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-display text-xl text-ink-900 leading-tight">{lot.name}</h3>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">{roaster.name}</p>
        </div>
        <span className="data-value text-sm text-gold-500 shrink-0">{lot.qGrade.toFixed(1)}</span>
      </div>

      <p className="text-sm text-ink-700 mb-1">
        {shop.name} · {shop.city}
      </p>
      <p className="text-sm text-ink-400 mb-3">{brewingMethod?.label ?? record.brewingMethod}</p>

      <div className="mb-3">
        <StarRating value={record.rating} />
      </div>

      {summary && <p className="text-sm text-ink-700 mb-2">{summary}</p>}

      {record.defects.length > 0 && (
        <p className="text-xs text-ink-500 mb-2">⚠ Дефекты: {record.defects.length}</p>
      )}

      {lot.descriptors.length > 0 && (
        <p className="text-xs text-ink-400 mb-3">{lot.descriptors.join(' · ')}</p>
      )}

      <p className="text-xs text-ink-300">
        Попробовано {formatTastingDate(record.createdAt)} · урожай {lot.cropYear}
      </p>
    </button>
  );
}
