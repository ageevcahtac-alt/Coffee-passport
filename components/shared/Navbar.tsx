'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { navItemsFor, type NavItem } from '@/lib/auth/cabinet';
import type { ProfileRole } from '@/lib/types/database';
import { EnthusiastFeedbackWidget } from './EnthusiastFeedbackWidget';
import { NotificationBell, NotificationCenterPanel } from './NotificationCenter';

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

  // Гамбургер-меню (пакет №4): на виду в шапке остаются только логотип и
  // чипса «Купить зерно домой»; вся навигация — Карта кофеен, Топовые
  // рецепты, Journey / кабинет роли, Обратная связь, Выйти — живёт в
  // выпадашке ☰ (десктоп и мобила — одно меню). Закрытие: клик вне меню
  // (прозрачный бэкдроп), повторный клик по ☰, Esc, переход по пункту.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const links = items.filter((item) => item.kind !== 'signOut');
  const signOutItem = items.find((item) => item.kind === 'signOut');

  return (
    // Липкая шапка (пакет №3): sticky — при скролле остаётся наверху с
    // непрозрачным фоном, границей и тенью; z-40 — НИЖЕ модалок/дроуера/
    // панели уведомлений (z-50), чтобы не перекрывать их. Выпадашка меню
    // рендерится ВНУТРИ шапки — её z-index считается внутри контекста
    // шапки, поэтому меню не перекроет модалки z-50 поверх неё. Leaflet-
    // панели карты (z до 1000) держим внутри .leaflet-container через
    // z-index: 0 в globals.css — иначе тайлы/маркеры рисовались бы поверх
    // шапки. На мобиле — компактная высота (py-2.5), чипса «Купить зерно
    // домой» остаётся на месте.
    <header className="sticky top-0 z-40 bg-parchment-100 px-4 sm:px-6 py-2.5 md:py-4
                       border-b border-ink-100 shadow-[0_1px_4px_rgba(43,33,24,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest2 text-ink-400 font-body shrink-0 leading-[1.35]"
          >
            Coffee
            <br />
            Passport
          </Link>
          {/* Магнит в магазин обжарщика — на всех страницах, для гостя и
              вошедшего. target=_blank + rel=noopener: уходит со своего домена
              наружу, текущую вкладку не трогает. Перелив — CSS (.shop-chip),
              prefers-reduced-motion глушится глобальным правилом. */}
          <a
            href="https://xocoffee.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="shop-chip inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5
                       text-[11px] sm:text-xs font-body font-medium text-ink-900 whitespace-nowrap"
          >
            🛍 Купить зерно домой
          </a>
        </div>

        {/* Правая часть — на всех ширинах: колокольчик уведомлений
            (вошедший энтузиаст) и ☰, открывающее единое меню. */}
        <div className="flex items-center gap-1 shrink-0">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-haspopup="true"
            aria-controls="site-nav-menu"
            aria-expanded={menuOpen}
            className="flex flex-col justify-center gap-1.5 w-9 h-9 items-center rounded-md
                       hover:bg-parchment-300 transition-colors"
          >
            <span className="block w-5 h-px bg-ink-700" />
            <span className="block w-5 h-px bg-ink-700" />
            <span className="block w-5 h-px bg-ink-700" />
          </button>
        </div>
      </div>

      {/* Выпадающее меню — поверх контента страницы, но внутри контекста
          шапки (ниже модалок z-50). Бэкдроп ловит клик вне меню. */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-0" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <div
            id="site-nav-menu"
            role="dialog"
            aria-label="Меню"
            className="absolute right-2 sm:right-4 top-full mt-1 z-10 w-72 max-w-[calc(100vw-1rem)]
                       rounded-md border border-ink-100 bg-parchment-100 py-2
                       shadow-[0_8px_24px_-8px_rgba(26,20,16,0.35)] reveal-fade"
          >
            <nav className="flex flex-col text-sm text-ink-700" aria-label="Навигация по сайту">
              {links.map((item) => (
                <NavEntry
                  key={item.label}
                  item={item}
                  onNavigate={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 hover:bg-parchment-300 hover:text-ink-900 transition-colors"
                />
              ))}
              {/* Обратная связь — перед «Выйти», как в прежней шапке. */}
              <div className="px-4 py-2.5 hover:bg-parchment-300 transition-colors">
                <EnthusiastFeedbackWidget />
              </div>
              {signOutItem && (
                <NavEntry
                  item={signOutItem}
                  className="block px-4 py-2.5 hover:bg-parchment-300 hover:text-ink-900 transition-colors"
                />
              )}
            </nav>
          </div>
        </>
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
