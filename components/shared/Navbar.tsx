'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { navItemsFor, type NavItem } from '@/lib/auth/cabinet';
import type { ProfileRole } from '@/lib/types/database';
import { EnthusiastFeedbackWidget } from './EnthusiastFeedbackWidget';
import { NotificationBell, NotificationCenterPanel } from './NotificationCenter';

const NAV_LINK_CLASSES = 'hover:text-ink-900';

// Пункты меню — из navItemsFor (lib/auth/cabinet.ts): гость видит только общее,
// вошедший — пункты своей роли и «Выйти». Состояние входа — только серверная
// сессия (app/(site)/layout.tsx), не данные гостя в браузере.
export function Navbar({ session }: { session: { role: ProfileRole } | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // GAP 1 (docs/reports/IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md) — "Log in" is
  // reachable from every (site) page, including the Public Passport, but
  // used to always drop the guest's return context (no `next`). A guest
  // signing up from /passport/[lotId] now lands back on that exact Lot's
  // Passport instead of always /journey.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentPath = `${pathname}${search ? `?${search}` : ''}`;
  const items = navItemsFor(session, currentPath);

  return (
    <header className="relative px-4 sm:px-6 py-4 border-b border-ink-100/0">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-xs uppercase tracking-widest2 text-ink-400 font-body shrink-0"
        >
          Coffee Passport
        </Link>

        {/* Desktop nav — hidden below md, where it would otherwise wrap and
            overlap the logo (see the reported mobile layout bug). */}
        <div className="hidden md:flex md:flex-col md:items-end md:gap-1.5">
          <nav className="flex items-center gap-4 text-sm text-ink-500">
            {items.map((item) => (
              <NavEntry key={item.label} item={item} className={NAV_LINK_CLASSES} />
            ))}
            {session && <NotificationBell />}
          </nav>
          {/* Right under Log in/Sign out — reachable from every guest-facing
              page via this shared header, not just /journey. */}
          <EnthusiastFeedbackWidget />
        </div>

        {/* Mobile hamburger — hidden from md up, where the full nav takes
            over. Sits on one row with the logo at every width, per the
            task's "логотип и кнопка меню в одну строку" requirement. The
            bell sits right beside it (same row, same tap-target size) since
            the mobile drawer is a plain link list, not a good home for a
            live popover. */}
        <div className="md:hidden flex items-center gap-1 shrink-0">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
            className="flex flex-col justify-center gap-1.5 w-9 h-9 items-center"
          >
            <span className="block w-5 h-px bg-ink-700" />
            <span className="block w-5 h-px bg-ink-700" />
            <span className="block w-5 h-px bg-ink-700" />
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex justify-end bg-ink-900/40" onClick={() => setMenuOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Меню"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xs h-full bg-parchment-100 px-6 py-6 flex flex-col gap-1 reveal-fade"
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs uppercase tracking-widest2 text-ink-400 font-body">Меню</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Закрыть меню"
                className="text-ink-400 text-2xl leading-none px-1"
              >
                ×
              </button>
            </div>

            <nav className="flex flex-col gap-1 text-base text-ink-700">
              {items.map((item) => (
                <NavEntry
                  key={item.label}
                  item={item}
                  onNavigate={() => setMenuOpen(false)}
                  className="w-full text-left py-3 border-b border-ink-100 hover:text-ink-900"
                />
              ))}
            </nav>

            <div className="mt-4">
              <EnthusiastFeedbackWidget />
            </div>
          </div>
        </div>
      )}

      <NotificationCenterPanel />
    </header>
  );
}

function NavEntry({ item, className, onNavigate }: { item: NavItem; className: string; onNavigate?: () => void }) {
  if (item.kind === 'signOut') {
    return (
      <form action={signOut}>
        <button type="submit" className={className}>
          {item.label}
        </button>
      </form>
    );
  }
  return (
    <Link href={item.href} onClick={onNavigate} className={className}>
      {item.label}
    </Link>
  );
}
