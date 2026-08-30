'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';

// No real cafe auth wired up yet (see app/dashboard/(members) for the
// Supabase-gated membership flow) — this cabinet is scoped to the pilot
// coffee shop for now, same as /dashboard/roaster is scoped to roaster-xo.
const ACTIVE_SHOP_ID = 'shop-xo-vsevolozhsk';

const TABS = [
  { href: '/dashboard/cafe', label: 'Меню зерна' },
  { href: '/dashboard/cafe/team', label: 'Команда / Персонал' },
  { href: '/dashboard/cafe/analytics', label: 'Аналитика и Отзывы' },
  { href: '/dashboard/cafe/equipment', label: 'Оборудование' },
] as const;

export default function CafeHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = getCoffeeShopById(ACTIVE_SHOP_ID);

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
            {shop ? `${shop.name} · ${shop.city}` : 'Кофейня'}
          </p>
          <h1 className="font-display text-3xl text-ink-900">Кабинет кофейни</h1>
        </div>

        <nav className="flex gap-1 border-b border-ink-200 mb-10 overflow-x-auto">
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
      </div>
    </main>
  );
}
