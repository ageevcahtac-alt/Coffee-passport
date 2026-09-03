'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/admin', label: 'Обратная связь' },
  { href: '/dashboard/admin/events', label: 'Мероприятия' },
] as const;

// Tabbed admin hub, same pattern as app/dashboard/cafe/(hub)/layout.tsx —
// the outer app/dashboard/admin/layout.tsx already handles the
// requireStaffRole('admin', ...) gate and StaffSessionProvider, this just
// adds the tab bar over its two sections.
export default function AdminHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <p className="section-label mb-2">Кабинет администратора</p>
        <h1 className="font-display text-3xl text-ink-900 mb-8">Платформа</h1>

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
