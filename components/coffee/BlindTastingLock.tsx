import Link from 'next/link';

// Gates the roaster's reference profile (Q-Score, descriptors, origin story)
// behind the guest's own blind read of the cup — see app/(site)/passport/
// [lotId]/page.tsx, which renders this instead of LotPassport/
// ProducerRoasterCard until a TastingRecord exists for the lot.
export function BlindTastingLock({ lotId }: { lotId: string }) {
  return (
    <div>
      <div className="rounded-md border border-gold-400 bg-gold-400/10 px-5 py-4 mb-8">
        <p className="text-sm text-ink-900 leading-relaxed">
          <span className="mr-1.5" aria-hidden="true">
            🔒
          </span>
          <strong className="font-medium">Режим слепой дегустации:</strong> оцените вкус
          самостоятельно! Заполните параметры (кислотность, сладость, тело, горечь) и сохраните
          карточку — после этого откроется эталонный профиль от обжарщика для сравнения.
        </p>
      </div>

      <div
        className="relative rounded-md border border-dashed border-ink-300 bg-parchment-100
                   px-6 py-14 text-center mb-8"
      >
        <span className="text-4xl mb-4 inline-block" aria-hidden="true">
          🔒
        </span>
        <p className="font-display text-lg text-ink-900 mb-2">Профиль обжарщика скрыт</p>
        <p className="text-ink-500 text-sm max-w-xs mx-auto">
          Q-Score, эталонные дескрипторы и история происхождения откроются после вашей
          собственной оценки вкуса.
        </p>
      </div>

      <Link
        href={`/passport/${lotId}/taste`}
        className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-4
                   hover:bg-ink-800 transition-colors"
      >
        Начать слепую дегустацию
      </Link>
    </div>
  );
}
