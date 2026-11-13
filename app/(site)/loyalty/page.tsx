'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/auth/currentUser';
import {
  fetchGuestHallCards,
  fetchGuestHistory,
  fetchOwnProfile,
  type OwnProfile,
} from '@/lib/data/loyalty';
import { LoyaltyCardView } from '@/components/loyalty/LoyaltyCardView';
import { GuestProfileEditor } from '@/components/loyalty/GuestProfileEditor';
import { GuestQrModal } from '@/components/loyalty/GuestQrModal';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { HISTORY_PREVIEW_COUNT } from '@/lib/types/loyalty';
import type { GuestHallCard, LoyaltyHistoryItem } from '@/lib/types/loyalty';

// "Лояльность" — контур «Зал»: ранг с цветом обжарки и прогрессом по тратам
// за 30 дней (у орденоносца — плашка вместо прогресс-бара), зёрна с таймером
// сгорания, карта-депозит и история операций (первые HISTORY_PREVIEW_COUNT
// строк + кнопка «Посмотреть все чеки»). Без входа — приглашение войти
// (баланс лояльности живёт только у зарегистрированного аккаунта).
export default function LoyaltyPage() {
  const { userId, isAuthenticated, ready } = useCurrentUser();
  const [cards, setCards] = useState<GuestHallCard[] | null>(null);
  const [history, setHistory] = useState<LoyaltyHistoryItem[]>([]);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    if (!ready || !isAuthenticated || !userId) return;
    let cancelled = false;
    fetchGuestHallCards(userId).then((result) => {
      if (!cancelled) setCards(result);
    });
    fetchGuestHistory(userId).then((items) => {
      if (!cancelled) setHistory(items);
    });
    // Свой профиль — через fetchOwnProfile (без ролевого фильтра): источник
    // истины БД, имя переживает перезаход/перелогин/смену устройства.
    fetchOwnProfile().then((result) => {
      if (!cancelled) setProfile(result);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated, userId]);

  if (!ready) return null;

  if (!isAuthenticated || !userId) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-16 text-center">
        <div className="max-w-xs">
          <p className="font-display text-xl text-ink-900 mb-2">Лояльность</p>
          <p className="text-sm text-ink-500 mb-6">Войдите в аккаунт Coffee Passport, чтобы увидеть свои карты лояльности.</p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-3.5
                       hover:bg-ink-800 transition-colors"
          >
            Войти
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">Вы</p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">
          💳 Лояльность{profile?.displayName ? ` — ${profile.displayName}` : ''}
        </h1>
        <p className="text-sm text-ink-500 mb-6">
          Ранги, зёрна и карта-депозит в кофейнях-партнёрах — единая учётная запись Coffee Passport.
        </p>

        {profile && <GuestProfileEditor profile={profile} onSaved={setProfile} />}

        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4 mb-10
                     hover:bg-ink-800 transition-colors"
        >
          📇 Показать мой QR-код
        </button>

        <p className="section-label mb-4">Карты кофеен</p>
        {cards === null ? (
          <p className="text-sm text-ink-400">Загрузка…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-ink-400">
            Пока нет активных карт — они появятся после первого визита в кофейню-партнёра.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((card) => (
              <LoyaltyCardView key={card.shopId} card={card} />
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-10">
            <p className="section-label mb-4">История операций</p>
            <div className="flex flex-col gap-2">
              {(showAllHistory ? history : history.slice(0, HISTORY_PREVIEW_COUNT)).map((item) => {
                const shop = getCoffeeShopById(item.shopId);
                return (
                  <div key={item.id} className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-ink-900">{item.label}</p>
                      <p className="text-[11px] text-ink-400 shrink-0">
                        {new Date(item.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {item.detail}
                      {shop && <span className="text-ink-400"> · {shop.name}</span>}
                    </p>
                  </div>
                );
              })}
            </div>
            {history.length > HISTORY_PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllHistory((value) => !value)}
                className="mt-3 w-full rounded-md border border-ink-200 px-4 py-2.5 text-sm text-ink-700
                           hover:bg-parchment-300 transition-colors"
              >
                {showAllHistory ? 'Свернуть' : 'Посмотреть все чеки'}
              </button>
            )}
          </div>
        )}
      </div>

      {qrOpen && <GuestQrModal guestId={userId} onClose={() => setQrOpen(false)} />}
    </main>
  );
}
