'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { fetchGuestLoyaltyCards, fetchGuestProfile, updateOwnDisplayName } from '@/lib/data/loyalty';
import { LoyaltyCardView } from '@/components/loyalty/LoyaltyCardView';
import { GuestQrModal } from '@/components/loyalty/GuestQrModal';
import type { LoyaltyCard } from '@/lib/types/loyalty';

// "Мои карты" — no separate sign-in for this module: the guest is already
// authenticated at the Coffee Passport app level (see currentUser.tsx), so
// landing here goes straight to their cards. Unlike the rest of the guest
// app, this has no anonymous-device tier — a loyalty balance needs a real
// account, so an anonymous visitor sees a sign-in prompt instead of an
// empty state.
export default function LoyaltyPage() {
  const { userId, isAuthenticated, ready } = useCurrentUser();
  const [cards, setCards] = useState<LoyaltyCard[] | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (!ready || !isAuthenticated || !userId) return;
    let cancelled = false;
    fetchGuestLoyaltyCards(userId).then((result) => {
      if (!cancelled) setCards(result);
    });
    fetchGuestProfile(userId).then((profile) => {
      if (!cancelled && profile) setDisplayName(profile.displayName ?? '');
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
          <p className="font-display text-xl text-ink-900 mb-2">Мои карты</p>
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

  async function handleSaveName() {
    setSavingName(true);
    const result = await updateOwnDisplayName(displayName.trim());
    setSavingName(false);
    if (result.ok) setEditingName(false);
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">Вы</p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">💳 Мои карты</h1>
        <p className="text-sm text-ink-500 mb-6">
          Ранги, скидки и абонементы в кофейнях-партнёрах — единая учётная запись Coffee Passport.
        </p>

        <div className="rounded-md border border-ink-200 bg-parchment-100 p-4 mb-6">
          {editingName ? (
            <div className="flex gap-2">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Как к вам обращаться?"
                className="flex-1 rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm
                           text-ink-900 placeholder:text-ink-300 focus:border-gold-400"
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={savingName || !displayName.trim()}
                className="rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-2
                           hover:bg-ink-800 transition-colors disabled:opacity-40"
              >
                {savingName ? '…' : 'Сохранить'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-900">
                Имя для бариста: <span className="font-medium">{displayName || 'не указано'}</span>
              </p>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0"
              >
                Изменить
              </button>
            </div>
          )}
        </div>

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
      </div>

      {qrOpen && <GuestQrModal guestId={userId} onClose={() => setQrOpen(false)} />}
    </main>
  );
}
