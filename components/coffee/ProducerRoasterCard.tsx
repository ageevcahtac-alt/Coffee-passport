import { ROAST_TYPE_LABELS, type Lot } from '@/lib/types/coffee';

// A single ratio against a fixed max (1-5) is a meter, not a chart: the fill
// carries the value, the track is a lighter step of the same hue, and — since
// each metric is its own labeled meter — no legend is needed.
function FlavorMeter({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-ink-500">{label}</span>
        <span className="data-value text-xs text-ink-900">{clamped}/5</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={5}
        className="h-2 rounded-full bg-gold-300/25"
      >
        <div
          className="h-2 rounded-full bg-gold-500"
          style={{ width: `${(clamped / 5) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function ProducerRoasterCard({ lot }: { lot: Lot }) {
  const { producer, roasterFlavorProfile } = lot;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span
          className="rounded-full border border-gold-400 text-gold-500 text-[11px]
                     uppercase tracking-widest2 px-2.5 py-1"
        >
          {ROAST_TYPE_LABELS[lot.roastType]}
        </span>
        <span className="data-value rounded-full bg-parchment-200 text-ink-700 text-[11px] px-2.5 py-1">
          Q {lot.qGrade.toFixed(1)}
        </span>
        <span className="data-value rounded-full bg-parchment-200 text-ink-700 text-[11px] px-2.5 py-1">
          {lot.cropYear}
        </span>
      </div>

      <p className="section-label mb-3">Происхождение</p>
      <dl className="grid gap-2.5 mb-6 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Фермер</dt>
          <dd className="text-ink-900 text-right">{producer.farmerName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Ферма</dt>
          <dd className="text-ink-900 text-right">{producer.farmName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Регион</dt>
          <dd className="text-ink-900 text-right">{lot.region}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Высота</dt>
          <dd className="data-value text-ink-900 text-right">{producer.altitude}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Обработка</dt>
          <dd className="text-ink-900 text-right">{lot.process}</dd>
        </div>
      </dl>

      <p className="section-label mb-3">Профиль обжарщика</p>
      <div className="flex flex-col gap-3 mb-6">
        <FlavorMeter label="Кислотность" value={roasterFlavorProfile.acidity} />
        <FlavorMeter label="Сладость" value={roasterFlavorProfile.sweetness} />
        <FlavorMeter label="Плотность" value={roasterFlavorProfile.body} />
        <FlavorMeter label="Горечь" value={roasterFlavorProfile.bitterness} />
      </div>

      <p className="section-label mb-3">История</p>
      <p className="text-sm text-ink-700 leading-relaxed">{producer.story}</p>
    </div>
  );
}
