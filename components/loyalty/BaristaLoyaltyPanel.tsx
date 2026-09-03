'use client';

import { useState, type FormEvent } from 'react';
import { QrScanner } from '@/components/coffee/QrScanner';
import { extractGuestId } from '@/lib/utils/guestQr';
import {
  fetchGuestProfile,
  fetchGuestShopContext,
  redeemPoints,
  sellSubscription,
} from '@/lib/data/loyalty';
import { isRankActive, SUBSCRIPTION_NOMINALS, type ShopRank, type Subscription } from '@/lib/types/loyalty';

interface GuestContext {
  id: string;
  displayName: string | null;
  ranks: ShopRank[];
  currentRank: ShopRank | null;
  visitsCount: number;
  totalSpent: number;
  subscriptions: Subscription[];
}

type Mode = 'idle' | 'scanning' | 'guest';
type Action = null | 'sell' | 'redeem';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Barista's loyalty console: scan a guest's QR (see GuestQrModal) → look up
// their standing at THIS shop only (per-shop isolation is enforced server-
// side by RLS, see 0012_loyalty_module.sql — this component just never
// asks for another shop's data) → sell a subscription or redeem a visit.
export function BaristaLoyaltyPanel({ shopId }: { shopId: string }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState('');
  const [guest, setGuest] = useState<GuestContext | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Sell form
  const [nominal, setNominal] = useState<number>(SUBSCRIPTION_NOMINALS[0]);

  // Redeem form
  const [grossAmount, setGrossAmount] = useState('');
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string>('');

  async function loadGuest(guestId: string) {
    setScanError('');
    const profile = await fetchGuestProfile(guestId);
    if (!profile) {
      setScanError('Гость не найден — попробуйте отсканировать код ещё раз.');
      return;
    }
    const context = await fetchGuestShopContext(guestId, shopId);
    const currentRank = context.status?.currentRankId
      ? context.ranks.find((r) => r.id === context.status?.currentRankId) ?? null
      : null;
    setGuest({
      id: profile.id,
      displayName: profile.displayName,
      ranks: context.ranks,
      currentRank: isRankActive(context.status) ? currentRank : null,
      visitsCount: context.status?.visitsCount ?? 0,
      totalSpent: context.status?.totalSpent ?? 0,
      subscriptions: context.subscriptions,
    });
    setMode('guest');
    setAction(null);
    setMessage(null);
  }

  function handleDecode(raw: string) {
    const guestId = extractGuestId(raw);
    if (!guestId) return;
    void loadGuest(guestId);
  }

  function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    const guestId = extractGuestId(manualCode);
    if (!guestId) return;
    void loadGuest(guestId);
  }

  function reset() {
    setMode('idle');
    setGuest(null);
    setAction(null);
    setMessage(null);
    setManualCode('');
    setGrossAmount('');
    setSelectedSubscriptionId('');
  }

  async function handleSell() {
    if (!guest) return;
    setBusy(true);
    const result = await sellSubscription(guest.id, shopId, nominal);
    setBusy(false);
    if (result.ok) {
      setMessage({ kind: 'ok', text: `Абонемент на ${nominal.toLocaleString('ru-RU')} ₽ продан.` });
      void loadGuest(guest.id);
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось продать абонемент.' });
    }
    setAction(null);
  }

  async function handleRedeem() {
    if (!guest) return;
    const amount = Number(grossAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    const result = await redeemPoints(guest.id, shopId, amount, selectedSubscriptionId || null);
    setBusy(false);
    if (result.ok) {
      setMessage({ kind: 'ok', text: 'Чек проведён, ранг пересчитан.' });
      setGrossAmount('');
      void loadGuest(guest.id);
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось списать баллы.' });
    }
    setAction(null);
  }

  const discountPreview = guest?.currentRank?.discountPercent ?? 0;
  const grossValue = Number(grossAmount) || 0;
  const netPreview = Math.round((grossValue * (100 - discountPreview)) / 100);
  const activeSubscriptions = guest?.subscriptions.filter((s) => s.status === 'active') ?? [];

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5 mb-10">
      <p className="section-label mb-4">Лояльность гостя</p>

      {mode === 'idle' && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setMode('scanning')}
            className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4
                       hover:bg-ink-800 transition-colors"
          >
            📷 Сканировать карту гостя
          </button>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Или введите ID гостя вручную"
              className={fieldClasses}
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="shrink-0 rounded-md border border-ink-200 px-4 text-sm text-ink-700
                         hover:bg-parchment-300 transition-colors disabled:opacity-40"
            >
              Найти
            </button>
          </form>
        </div>
      )}

      {mode === 'scanning' && (
        <div className="flex flex-col gap-3">
          <QrScanner onDecode={handleDecode} onError={setScanError} />
          {scanError && <p className="text-xs text-ink-500">⚠ {scanError}</p>}
          <button type="button" onClick={reset} className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900">
            Отмена
          </button>
        </div>
      )}

      {mode === 'guest' && guest && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-xl text-ink-900 leading-tight">
                {guest.displayName || 'Гость без имени'}
              </h3>
              <p className="text-xs text-ink-400 mt-1">
                {guest.currentRank ? `${guest.currentRank.rankName} · −${guest.currentRank.discountPercent}%` : 'Без ранга · без скидки'}
              </p>
            </div>
            <button type="button" onClick={reset} className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0">
              Другой гость
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-400 text-xs mb-0.5">Визитов в этой кофейне</dt>
              <dd className="data-value text-ink-900">{guest.visitsCount}</dd>
            </div>
            <div>
              <dt className="text-ink-400 text-xs mb-0.5">Потрачено, ₽</dt>
              <dd className="data-value text-ink-900">{guest.totalSpent.toLocaleString('ru-RU')}</dd>
            </div>
          </dl>

          {activeSubscriptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-ink-400">Абонементы</p>
              {activeSubscriptions.map((sub) => (
                <p key={sub.id} className="text-sm data-value text-ink-900">
                  {sub.currentBalance.toLocaleString('ru-RU')} ₽ из {sub.initialNominal.toLocaleString('ru-RU')} ₽
                </p>
              ))}
            </div>
          )}

          {message && (
            <p className={`text-sm ${message.kind === 'ok' ? 'text-moss-700' : 'text-ink-500'}`}>
              {message.kind === 'ok' ? '✓ ' : '⚠ '}
              {message.text}
            </p>
          )}

          {action === null && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAction('sell')}
                className="flex-1 rounded-md border border-ink-200 text-ink-700 text-sm px-4 py-3
                           hover:bg-parchment-300 transition-colors"
              >
                Продать абонемент
              </button>
              <button
                type="button"
                onClick={() => setAction('redeem')}
                className="flex-1 rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-3
                           hover:bg-ink-800 transition-colors"
              >
                Списать баллы
              </button>
            </div>
          )}

          {action === 'sell' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-ink-400">Номинал абонемента</p>
              <div className="grid grid-cols-4 gap-2">
                {SUBSCRIPTION_NOMINALS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setNominal(option)}
                    aria-pressed={nominal === option}
                    className={`rounded-md border py-2.5 text-xs data-value transition-colors ${
                      nominal === option ? 'border-gold-400 bg-gold-400/10 text-ink-900' : 'border-ink-200 text-ink-700'
                    }`}
                  >
                    {option.toLocaleString('ru-RU')} ₽
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAction(null)}
                  className="flex-1 rounded-md border border-ink-200 text-ink-700 text-sm px-4 py-3 hover:bg-parchment-300 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSell}
                  disabled={busy}
                  className="flex-[2] rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-3
                             hover:bg-ink-800 transition-colors disabled:opacity-40"
                >
                  {busy ? 'Продаём…' : `Продать за ${nominal.toLocaleString('ru-RU')} ₽`}
                </button>
              </div>
            </div>
          )}

          {action === 'redeem' && (
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="redeem-amount" className="block text-xs text-ink-400 mb-1.5">
                  Сумма чека, ₽
                </label>
                <input
                  id="redeem-amount"
                  type="number"
                  min="0"
                  step="1"
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value)}
                  className={fieldClasses}
                />
              </div>

              {activeSubscriptions.length > 0 && (
                <div>
                  <label htmlFor="redeem-subscription" className="block text-xs text-ink-400 mb-1.5">
                    Списать с абонемента
                  </label>
                  <select
                    id="redeem-subscription"
                    value={selectedSubscriptionId}
                    onChange={(e) => setSelectedSubscriptionId(e.target.value)}
                    className={fieldClasses}
                  >
                    <option value="">Без абонемента (оплата на кассе)</option>
                    {activeSubscriptions.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        Баланс {sub.currentBalance.toLocaleString('ru-RU')} ₽
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {grossValue > 0 && (
                <p className="text-xs text-ink-500 rounded-md bg-parchment-200 px-3 py-2.5">
                  Скидка ранга: −{discountPreview}% → к списанию{' '}
                  <span className="data-value text-ink-900">{netPreview.toLocaleString('ru-RU')} ₽</span>
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAction(null)}
                  className="flex-1 rounded-md border border-ink-200 text-ink-700 text-sm px-4 py-3 hover:bg-parchment-300 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleRedeem}
                  disabled={busy || grossValue <= 0}
                  className="flex-[2] rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-3
                             hover:bg-ink-800 transition-colors disabled:opacity-40"
                >
                  {busy ? 'Списываем…' : 'Провести чек'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
