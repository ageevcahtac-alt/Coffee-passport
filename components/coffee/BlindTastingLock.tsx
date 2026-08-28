import Link from 'next/link';
import type { Lot } from '@/lib/types/coffee';

// Gates the roaster's detailed read of the lot (descriptors, flavor
// diagram) behind the guest's own blind cupping — see app/(site)/passport/
// [lotId]/page.tsx, which renders this instead of LotPassport/
// ProducerRoasterCard until a TastingRecord exists for the lot. A handful
// of basic facts (origin, farm, process, Q-Score, crop year) stay visible
// even locked — only the tasting-note content is a spoiler.
export function BlindTastingLock({
  lot,
  onStartTasting,
}: {
  lot: Lot;
  onStartTasting?: () => void;
}) {
  return (
    <div>
      <div className="rounded-md border border-gold-400 bg-gold-400/10 px-5 py-4 mb-8">
        <p className="text-sm text-ink-900 leading-relaxed">
          <span className="mr-1.5" aria-hidden="true">
            🔒
          </span>
          <strong className="font-medium">Доверьтесь своим рецепторам!</strong> Оцените
          кислотность, сладость, тело и горечь. После сохранения карточки откроется профиль от
          обжарщика.
        </p>
      </div>

      <div className="rounded-md border border-ink-200 bg-parchment-100 p-5 mb-4">
        <p className="section-label mb-4">Базовые данные</p>
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-400 shrink-0">Страна / Регион</dt>
            <dd className="text-ink-900 text-right">
              {lot.country}, {lot.region}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-400 shrink-0">Ферма</dt>
            <dd className="text-ink-900 text-right">{lot.producer.farmName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-400 shrink-0">Способ обработки</dt>
            <dd className="text-ink-900 text-right">{lot.process}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-400 shrink-0">Год урожая</dt>
            <dd className="data-value text-ink-900 text-right">{lot.cropYear}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-400 shrink-0">Q-Score</dt>
            <dd className="data-value text-gold-500 text-right">{lot.qGrade.toFixed(1)}</dd>
          </div>
        </dl>
      </div>

      <div className="relative rounded-md border border-dashed border-ink-300 bg-parchment-100 px-6 py-14 text-center mb-8">
        <span className="text-4xl mb-4 inline-block" aria-hidden="true">
          🔒
        </span>
        <p className="font-display text-lg text-ink-900 mb-2">Вкусовые дескрипторы скрыты</p>
        <p className="text-ink-500 text-sm max-w-xs mx-auto">
          Диаграмма вкуса и заметки обжарщика откроются после вашей собственной слепой оценки.
        </p>
      </div>

      <Link
        href={`/passport/${lot.id}/taste`}
        onClick={onStartTasting}
        className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-4
                   hover:bg-ink-800 transition-colors"
      >
        Начать слепую дегустацию
      </Link>
    </div>
  );
}
