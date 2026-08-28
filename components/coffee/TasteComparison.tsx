import { FLAVOR_AXES, type Lot, type TastingRecord } from '@/lib/types/coffee';
import { StarRating } from './StarRating';
import { FlavorRadar } from './FlavorRadar';

export function TasteComparison({
  lot,
  tasting,
  animate = false,
}: {
  lot: Lot;
  tasting: TastingRecord;
  animate?: boolean;
}) {
  const guestValues = FLAVOR_AXES.map(({ key }) => tasting.guestFlavorProfile[key]);
  const roasterValues = FLAVOR_AXES.map(({ key }) => lot.roasterFlavorProfile[key]);

  return (
    <div
      className={`rounded-md border border-ink-200 bg-parchment-100 p-5 ${animate ? 'reveal-fade' : ''}`}
    >
      <p className="section-label mb-1">Ваши ощущения vs Задумка обжарщика</p>
      <p className="text-xs text-ink-400 mb-5">
        Сравнение вашей слепой оценки с эталонным профилем
      </p>

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-ink-400 mb-1.5">Ваша оценка чашки</p>
          <StarRating value={tasting.rating} label={`Ваша оценка ${tasting.rating} из 5`} />
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-400 mb-1.5">Q-Score обжарщика</p>
          <span className="data-value text-lg text-gold-500">{lot.qGrade.toFixed(1)}</span>
        </div>
      </div>

      <FlavorRadar
        series={[
          { label: 'Вы', color: 'var(--color-rating)', values: guestValues },
          { label: 'Обжарщик', color: 'var(--color-gold-500)', values: roasterValues },
        ]}
      />

      <div className="flex items-center justify-center gap-4 mt-2 mb-5 text-xs text-ink-500">
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

      <div className="flex flex-col gap-1.5">
        {FLAVOR_AXES.map(({ key, label }, i) => {
          const diff = guestValues[i] - roasterValues[i];
          return (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-ink-700">{label}</span>
              <span className="data-value text-ink-400">
                {guestValues[i]}/5 · {roasterValues[i]}/5 ·{' '}
                {diff === 0 ? 'совпадение' : diff > 0 ? `+${diff}` : diff}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
