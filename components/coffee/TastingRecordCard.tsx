import type { TastingRecord } from '@/lib/types/coffee';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { getLotById } from '@/lib/data/lots';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function TastingRecordCard({ record }: { record: TastingRecord }) {
  const lot = getLotById(record.lotId);
  const roaster = getRoasterById(record.roasterId);
  const shop = getCoffeeShopById(record.coffeeShopId);
  const brewingMethod = BREWING_METHODS.find((method) => method.id === record.brewingMethod);

  if (!lot || !roaster || !shop) return null;

  return (
    <article className="rounded-md border border-ink-200 bg-parchment-100 p-5">
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

      <div className="flex items-center gap-1 mb-3" aria-label={`Оценка ${record.rating} из 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            style={{ color: star <= record.rating ? 'var(--color-rating)' : 'var(--color-ink-200)' }}
          >
            ★
          </span>
        ))}
      </div>

      {lot.descriptors.length > 0 && (
        <p className="text-xs text-ink-400 mb-3">{lot.descriptors.join(' · ')}</p>
      )}

      <p className="text-xs text-ink-300">
        Попробовано {formatDate(record.createdAt)} · урожай {lot.harvestYear}
      </p>
    </article>
  );
}
