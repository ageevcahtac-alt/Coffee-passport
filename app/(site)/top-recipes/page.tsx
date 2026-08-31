// Placeholder shell for the platform-wide "Топовые рецепты" leaderboard
// (navbar entry — see components/shared/Navbar.tsx). Scoped to exactly
// three curated slots for now; wiring these to real data (an actual
// "chef barista pick" flag, a real roaster-wide ranking, and the existing
// per-lot Community Top algorithm — see COMMUNITY_TOP_MIN_NET_VOTES in
// lib/types/coffee.ts) is a follow-up once there's a cross-lot ranking
// model to back it.

const SLOTS = [
  {
    rank: 1,
    title: 'Рецепт от шеф-бариста',
    description: 'Персональный выбор шеф-бариста платформы — скоро здесь появится реальный рецепт.',
    accent: 'border-gold-400 bg-gold-400/10 text-gold-500',
  },
  {
    rank: 2,
    title: 'Выбор обжарщиков',
    description: 'Рецепт, который чаще всего рекомендуют сами обжарщики-партнёры.',
    accent: 'border-moss-500 text-moss-500',
  },
  {
    rank: 3,
    title: 'Топ сообщества',
    description: 'Рецепт с наибольшим числом голосов сообщества энтузиастов.',
    accent: 'border-ink-300 text-ink-500',
  },
] as const;

export default function TopRecipesPage() {
  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="section-label mb-2">Топовые рецепты</p>
        <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-3">Избранное платформы</h1>
        <p className="text-ink-500 text-sm mb-10">
          Три главных рецепта Coffee Passport — скоро здесь появятся живые данные.
        </p>

        <div className="flex flex-col gap-4">
          {SLOTS.map((slot) => (
            <div
              key={slot.rank}
              className="rounded-md border border-ink-200 bg-parchment-100 p-5 flex items-start gap-4"
            >
              <span
                className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border
                            text-sm font-medium data-value ${slot.accent}`}
              >
                #{slot.rank}
              </span>
              <div>
                <h2 className="font-display text-lg text-ink-900 leading-tight mb-1">{slot.title}</h2>
                <p className="text-sm text-ink-500 leading-relaxed">{slot.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
