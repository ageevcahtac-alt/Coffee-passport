import { BecomePartnerSection } from '@/components/site/BecomePartnerSection';
import { EnthusiastAuthForm } from '@/components/site/EnthusiastAuthForm';

// The "экосистема 360°" cards — purely explanatory (no href/CTA): the
// enthusiast form below is now the one entry point on this page, coffee
// shop / roaster cabinets are reached after a real account exists, not by
// picking a role here.
const ECOSYSTEM = [
  {
    icon: '☕',
    title: 'Энтузиаст',
    description:
      'Фиксирует дескрипторы, ведёт личный дневник вкуса и влияет на индустрию своей оценкой.',
  },
  {
    icon: '🏪',
    title: 'Кофейня',
    description:
      'Видит честный фидбек от гостей в зале и оттачивает качество заваривания Specialty-зерна.',
  },
  {
    icon: '⚙️',
    title: 'Обжарщик',
    description:
      'Получает аналитику с полей — как раскрывается профиль его обжарки в чашках у гостей.',
  },
] as const;

export default function LandingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="min-h-dvh flex flex-col bg-parchment-200">
      <section className="flex-1 px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="text-center mb-12 max-w-md mx-auto sm:max-w-lg">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-3">
            Coffee Passport
          </p>
          <h1 className="font-display text-4xl leading-[1.1] text-ink-900 mb-4">
            От зерна до чашки — один прозрачный диалог
          </h1>
          <p className="text-ink-500 text-base leading-relaxed max-w-sm mx-auto">
            Платформа для Specialty Coffee сообщества, объединяющая гостя, кофейню и обжарщика.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
          {ECOSYSTEM.map((item) => (
            <div
              key={item.title}
              className="flex flex-col rounded-md border border-ink-200 bg-parchment-100 p-6"
            >
              <span className="text-3xl mb-4 inline-block w-fit" aria-hidden="true">
                {item.icon}
              </span>
              <h2 className="font-display text-xl text-ink-900 mb-2">{item.title}</h2>
              <p className="text-ink-500 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>

        <EnthusiastAuthForm error={searchParams.error} />

        <BecomePartnerSection />
      </section>

      <footer className="px-6 pb-8 text-center">
        <p className="text-[11px] text-ink-300 font-body">Every lot, tasted and remembered.</p>
      </footer>
    </main>
  );
}
