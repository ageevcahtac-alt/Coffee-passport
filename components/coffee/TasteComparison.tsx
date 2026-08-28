import type { Lot, RoasterFlavorProfile, TastingRecord } from '@/lib/types/coffee';
import { StarRating } from './StarRating';

const AXES: { key: keyof RoasterFlavorProfile; label: string }[] = [
  { key: 'acidity', label: 'Кислотность' },
  { key: 'sweetness', label: 'Сладость' },
  { key: 'body', label: 'Плотность' },
  { key: 'bitterness', label: 'Горечь' },
];

export function TasteComparison({
  lot,
  tasting,
  animate = false,
}: {
  lot: Lot;
  tasting: TastingRecord;
  animate?: boolean;
}) {
  return (
    <div className={`rounded-md border border-ink-200 bg-parchment-100 p-5 ${animate ? 'reveal-fade' : ''}`}>
      <p className="section-label mb-5">Сравнение вкуса</p>

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-ink-400 mb-1.5">Ваша оценка чашки</p>
          <StarRating value={tasting.rating} label={`Ваша оценка ${tasting.rating} из 5`} />
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-400 mb-1.5">Q-Score обжарщика</p>
          <span className="data-value text-lg text-gold-500">{lot.qGrade.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: 'var(--color-rating)' }}
          />
          Вы
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gold-500 shrink-0" />
          Обжарщик
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {AXES.map(({ key, label }) => (
          <ComparisonRow
            key={key}
            label={label}
            guestValue={tasting.guestFlavorProfile[key]}
            roasterValue={lot.roasterFlavorProfile[key]}
          />
        ))}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  guestValue,
  roasterValue,
}: {
  label: string;
  guestValue: number;
  roasterValue: number;
}) {
  const diff = guestValue - roasterValue;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-ink-900">{label}</span>
        <span className="data-value text-xs text-ink-400">
          {diff === 0 ? 'Совпадение' : `${diff > 0 ? '+' : ''}${diff}`}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-2 rounded-full bg-parchment-300 overflow-hidden">
          <div
            className="h-2 rounded-full"
            style={{ width: `${(guestValue / 5) * 100}%`, backgroundColor: 'var(--color-rating)' }}
          />
        </div>
        <div className="h-2 rounded-full bg-parchment-300 overflow-hidden">
          <div className="h-2 rounded-full bg-gold-500" style={{ width: `${(roasterValue / 5) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
