import type { Lot, Roaster } from '@/lib/types/coffee';
import { QGrade } from './QGrade';
import { DescriptorTags } from './DescriptorTags';

export function LotPassport({ lot, roaster }: { lot: Lot; roaster: Roaster }) {
  return (
    <div className="max-w-md mx-auto w-full">
      <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
        {roaster.name}
      </p>
      <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-8">
        {lot.name}
      </h1>

      <div className="flex justify-center mb-10">
        <QGrade value={lot.qGrade} />
      </div>

      <p className="text-ink-500 text-sm leading-relaxed text-center mb-10 max-w-xs mx-auto">
        Q-grade — профессиональная оценка качества, присвоенная этому лоту.
      </p>

      <p className="section-label mb-4">Происхождение</p>
      <dl className="grid gap-3 mb-8 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-400">Страна</dt>
          <dd className="data-value text-ink-900">{lot.country}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-400">Регион</dt>
          <dd className="data-value text-ink-900">{lot.region}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-400">Обработка</dt>
          <dd className="data-value text-ink-900">{lot.process}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-400">Урожай</dt>
          <dd className="data-value text-ink-900">{lot.cropYear}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-400">Профиль обжарки</dt>
          <dd className="data-value text-ink-900">{lot.roastProfile}</dd>
        </div>
      </dl>

      <p className="section-label mb-4">Вкусовой профиль</p>
      <DescriptorTags descriptors={lot.descriptors} />
    </div>
  );
}
