'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/coffee-kitchen', label: 'Мой кофе' },
  { href: '/coffee-kitchen/recipes', label: 'Мои рецепты' },
] as const;

// Coffee Kitchen ("Кофейная кухня") — the enthusiast's fully standalone
// home lab, renamed/evolved from the earlier "My Taste". Two subsections,
// same tabbed-hub pattern as app/dashboard/cafe/(hub)/layout.tsx: "Мой
// кофе" (a private shelf of coffee the catalog has never heard of) and
// "Мои рецепты" (brewing parameters, was HomeRecipe). The per-coffee
// detail page lives OUTSIDE this (hub) group (app/(site)/coffee-kitchen/
// [coffeeId]/page.tsx) so it doesn't inherit these top tabs — same reason
// the cafe dashboard's [lotId]/edit page sits outside its own (hub).
export default function CoffeeKitchenHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">Вы</p>
            <h1 className="font-display text-3xl text-ink-900">🍳 Кофейная кухня</h1>
          </div>
          <Link
            href="/coffee-kitchen/equipment"
            className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0 mt-1"
          >
            ⚙️ Оборудование
          </Link>
        </div>
        <p className="text-sm text-ink-500 mb-8">
          Полностью автономное пространство для домашних экспериментов — не связано с посещением кофеен.
        </p>

        <nav className="flex gap-1 border-b border-ink-200 mb-8">
          {TABS.map((tab) => {
            const active = tab.href === pathname;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 px-4 py-3 text-sm font-body border-b-2 -mb-px transition-colors
                            ${active
                              ? 'border-gold-400 text-ink-900 font-medium'
                              : 'border-transparent text-ink-400 hover:text-ink-700'}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {children}

        <Link
          href="/journey"
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-10 inline-block"
        >
          ← Моё кофейное путешествие
        </Link>
      </div>
    </main>
  );
}
