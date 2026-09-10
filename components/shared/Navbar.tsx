'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { EnthusiastFeedbackWidget } from './EnthusiastFeedbackWidget';
import { NotificationBell, NotificationCenterPanel } from './NotificationCenter';

const NAV_LINK_CLASSES = 'hover:text-ink-900';

export function Navbar({ userEmail }: { userEmail: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // GAP 1 (IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md) — "Log in" is
  // reachable from every (site) page, including the Public Passport, but
  // used to always drop the guest's return context (no `next`). A guest
  // signing up from /passport/[lotId] now lands back on that exact Lot's
  // Passport instead of always /journey.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentPath = `${pathname}${search ? `?${search}` : ''}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(currentPath)}`;

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
            <Link href="/map" className={NAV_LINK_CLASSES}>🗺️ Карта кофеен</Link>
            <Link href="/recipes" className={NAV_LINK_CLASSES}>🏆 Топовые рецепты</Link>
            {userEmail ? (
              <>
                <Link href="/journey" className={NAV_LINK_CLASSES}>🧳 Journey</Link>
                <Link href="/coffee-kitchen" className={NAV_LINK_CLASSES}>🍳 Coffee Kitchen</Link>
                <Link href="/loyalty" className={NAV_LINK_CLASSES}>💳 Мои карты</Link>
                <NotificationBell />
                <form action={signOut}>
                  <button type="submit" className={NAV_LINK_CLASSES}>Sign out</button>
                </form>
              </>
            ) : (
              <Link href={loginHref} className={NAV_LINK_CLASSES}>Log in</Link>
            )}
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
              <Link
                href="/map"
                onClick={() => setMenuOpen(false)}
                className="py-3 border-b border-ink-100 hover:text-ink-900"
              >
                🗺️ Карта кофеен
              </Link>
              <Link
                href="/recipes"
                onClick={() => setMenuOpen(false)}
                className="py-3 border-b border-ink-100 hover:text-ink-900"
              >
                🏆 Топовые рецепты
              </Link>
              {userEmail ? (
                <>
                  <Link
                    href="/journey"
                    onClick={() => setMenuOpen(false)}
                    className="py-3 border-b border-ink-100 hover:text-ink-900"
                  >
                    🧳 Journey
                  </Link>
                  <Link
                    href="/coffee-kitchen"
                    onClick={() => setMenuOpen(false)}
                    className="py-3 border-b border-ink-100 hover:text-ink-900"
                  >
                    🍳 Coffee Kitchen
                  </Link>
                  <Link
                    href="/loyalty"
                    onClick={() => setMenuOpen(false)}
                    className="py-3 border-b border-ink-100 hover:text-ink-900"
                  >
                    💳 Мои карты
                  </Link>
                  <form action={signOut}>
                    <button type="submit" className="w-full text-left py-3 border-b border-ink-100 hover:text-ink-900">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link
                  href={loginHref}
                  onClick={() => setMenuOpen(false)}
                  className="py-3 border-b border-ink-100 hover:text-ink-900"
                >
                  Log in
                </Link>
              )}
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
