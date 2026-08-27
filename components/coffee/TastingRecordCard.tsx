import type { TastingRecord } from '@/lib/types/coffee';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { getLotById } from '@/lib/data/lots';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from './StarRating';

export function TastingRecordCard({
  record,
  onClick,
}: {
  record: TastingRecord;
  onClick?: () => void;
}) {
  const lot = getLotById(record.lotId);
  const roaster = getRoasterById(record.roasterId);
  const shop = getCoffeeShopById(record.coffeeShopId);
  const brewingMethod = BREWING_METHODS.find((method) => method.id === record.brewingMethod);

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

      {lot.descriptors.length > 0 && (
        <p className="text-xs text-ink-400 mb-3">{lot.descriptors.join(' · ')}</p>
      )}

      <p className="text-xs text-ink-300">
        Попробовано {formatTastingDate(record.createdAt)} · урожай {lot.harvestYear}
      </p>
    </button>
  );
}
