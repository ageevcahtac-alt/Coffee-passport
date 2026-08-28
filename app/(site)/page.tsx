import Link from 'next/link';

const ROLES = [
  {
    icon: '☕',
    title: 'Кофейный энтузиаст',
    tag: 'Гость · Дневник',
    description:
      'Сканируйте QR-коды зерна, ведите личный дневник дегустаций и оценивайте вкус.',
    cta: 'Войти как гость',
    href: '/journey',
  },
  {
    icon: '🏭',
    title: 'Обжарщик',
    tag: 'XO COFFEE Roasters',
    description:
      'Управление лотами, составление дескрипторов вкуса, Q-Score и генерация паспортов.',
    cta: 'Кабинет обжарщика',
    href: '/dashboard/roaster',
  },
  {
    icon: '🏪',
    title: 'Кофейня / B2B',
    tag: 'XO Coffee · Всеволожск',
    description:
      'Управление меню зерна, команда бариста и фидбек от гостей.',
    cta: 'Кабинет кофейни',
    href: '/dashboard/cafe',
  },
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col bg-parchment-200">
      <section className="flex-1 px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="text-center mb-12 max-w-md mx-auto sm:max-w-lg">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-3">
            Coffee Passport
          </p>
          <h1 className="font-display text-4xl leading-[1.1] text-ink-900 mb-4">
            Выберите свою роль
          </h1>
          <p className="text-ink-500 text-base leading-relaxed max-w-sm mx-auto">
            Одна платформа — три взгляда на кофе: от чашки до зерна.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {ROLES.map((role) => (
            <Link
              key={role.title}
              href={role.href}
              className="group flex flex-col rounded-md border border-ink-200 bg-parchment-100 p-6
                         transition-all duration-300 ease-out
                         hover:-translate-y-1 hover:border-gold-400
                         hover:shadow-[0_16px_28px_-16px_rgba(26,20,16,0.35)]"
            >
              <span
                className="text-3xl mb-4 inline-block w-fit transition-transform duration-300
                           ease-out group-hover:-translate-y-0.5 group-hover:scale-110
                           group-hover:-rotate-3"
                aria-hidden="true"
              >
                {role.icon}
              </span>
              <h2 className="font-display text-xl text-ink-900 mb-1">{role.title}</h2>
              <p className="text-xs uppercase tracking-widest2 text-ink-400 mb-4">{role.tag}</p>
              <p className="text-ink-500 text-sm leading-relaxed mb-6 flex-1">
                {role.description}
              </p>
              <span
                className="inline-flex items-center justify-center rounded-md bg-ink-900
                           text-parchment-100 font-body font-medium text-sm px-5 py-3
                           transition-colors group-hover:bg-gold-500"
              >
                {role.cta}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="px-6 pb-8 text-center">
        <p className="text-[11px] text-ink-300 font-body">Every lot, tasted and remembered.</p>
      </footer>
    </main>
  );
}
