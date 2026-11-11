'use client';

import { useState, type FormEvent } from 'react';
import { QrScanner } from '@/components/coffee/QrScanner';
import { extractGuestId } from '@/lib/utils/guestQr';
import {
  consume,
  fetchGuestProfile,
  fetchGuestShopContext,
  purchaseCard,
} from '@/lib/data/loyalty';
import {
  beansCountdown,
  CARD_NOMINALS,
  maxBeansForCheck,
  pluralizeDays,
  type DepositCard,
  type GuestShopStatus,
  type ShopRank,
} from '@/lib/types/loyalty';

interface GuestContext {
  id: string;
  displayName: string | null;
  status: GuestShopStatus | null;
  ranks: ShopRank[];
  effectiveRank: ShopRank | null;
  spend30d: number;
  beansBalance: number;
  beansExpireAt: string | null;
  card: DepositCard | null;
}

type Mode = 'idle' | 'scanning' | 'guest';
type Action = null | 'sell' | 'consume';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Barista's loyalty console (stage 1, контур «Зал»): scan a guest's QR →
// провести чек (наличные + опционально зёрна до 50% и/или карта с доплатой)
// или продать/пополнить карту-депозит. Все правила (потолок 50%, clamp к
// живому балансу, кэшбэк % ранга, приветственные 300) — в RPC loyalty_consume;
// этот компонент только рисует то, что сервер вернул.
export function BaristaLoyaltyPanel({ shopId }: { shopId: string }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState('');
  const [guest, setGuest] = useState<GuestContext | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Sell/top-up form
  const [nominal, setNominal] = useState<number>(CARD_NOMINALS[0]);

  // Consume form
  const [grossAmount, setGrossAmount] = useState('');
  const [beansRedeem, setBeansRedeem] = useState('');
  const [useCard, setUseCard] = useState(false);
  const [cardPay, setCardPay] = useState('');

  async function loadGuest(guestId: string) {
    setScanError('');
    const profile = await fetchGuestProfile(guestId);
    if (!profile) {
      setScanError('Гость не найден — попробуйте отсканировать код ещё раз.');
      return;
    }
    const context = await fetchGuestShopContext(guestId, shopId);
    setGuest({
      id: profile.id,
      displayName: profile.displayName,
      status: context.status,
      ranks: context.ranks,
      effectiveRank: context.effectiveRank,
      spend30d: context.spend30d,
      beansBalance: context.beansBalance,
      beansExpireAt: context.beansExpireAt,
      card: context.card,
    });
    setMode('guest');
    setAction(null);
    setMessage(null);
    setGrossAmount('');
    setBeansRedeem('');
    setUseCard(false);
    setCardPay('');
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
    setBeansRedeem('');
    setUseCard(false);
    setCardPay('');
  }

  async function handleSell() {
    if (!guest) return;
    setBusy(true);
    const result = await purchaseCard(guest.id, shopId, nominal);
    setBusy(false);
    if (result.ok) {
      setMessage({
        kind: 'ok',
        text: `Карта на ${nominal.toLocaleString('ru-RU')} ₽ ${result.card && guest.card ? 'пополнена' : 'продана'}. Баланс: ${(result.card?.balance ?? 0).toLocaleString('ru-RU')} ₽. Ранг и зёрна не изменились.`,
      });
      void loadGuest(guest.id);
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось продать карту.' });
    }
    setAction(null);
  }

  async function handleConsume() {
    if (!guest) return;
    const gross = Number(grossAmount);
    if (!Number.isFinite(gross) || gross <= 0) return;
    const beans = Number(beansRedeem) || 0;
    const card = useCard && guest.card ? Number(cardPay) || 0 : 0;
    setBusy(true);
    const result = await consume(guest.id, shopId, gross, beans, card);
    setBusy(false);
    if (result.ok && result.result) {
      const { consumption, beansBalanceAfter } = result.result;
      const parts = [
        consumption.beansEarned > 0 ? `кэшбэк +${consumption.beansEarned} зёрен` : null,
        consumption.beansRedeemed > 0 ? `списано ${consumption.beansRedeemed} зёрен` : null,
        consumption.welcomeGranted > 0 ? `приветственные +${consumption.welcomeGranted} зёрен` : null,
      ].filter(Boolean);
      setMessage({
        kind: 'ok',
        text: `Чек проведён (${parts.join(', ') || 'без зёрен'}). Баланс зёрен: ${beansBalanceAfter}. Ранг пересчитан.`,
      });
      setGrossAmount('');
      setBeansRedeem('');
      setUseCard(false);
      setCardPay('');
      void loadGuest(guest.id);
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось провести чек.' });
    }
    setAction(null);
  }

  const grossValue = Number(grossAmount) || 0;
  const beansMax = guest ? Math.min(maxBeansForCheck(grossValue), guest.beansBalance) : 0;
  const beansValue = Math.min(Number(beansRedeem) || 0, beansMax);
  const cardMax = guest?.card ? Math.min(guest.card.balance, Math.max(0, grossValue - beansValue)) : 0;
  const cardValue = useCard ? Math.min(Number(cardPay) || 0, cardMax) : 0;
  const cashValue = Math.max(0, grossValue - beansValue - cardValue);
  const earnPreview = guest?.effectiveRank ? Math.round((grossValue * guest.effectiveRank.beansPercent) / 100) : 0;
  const countdown = guest ? beansCountdown(guest.beansExpireAt) : null;

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
                {guest.effectiveRank ? (
                  <>
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                      style={{ backgroundColor: guest.effectiveRank.colorHex }}
                      aria-hidden="true"
                    />
                    {guest.effectiveRank.rankName} · кэшбэк {guest.effectiveRank.beansPercent}%
                    {guest.status?.ordenRankId && guest.status.ordenPinned ? ' · 🎖 орден' : ''}
                  </>
                ) : (
                  'Без ранга · кэшбэк 0%'
                )}
              </p>
            </div>
            <button type="button" onClick={reset} className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0">
              Другой гость
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-400 text-xs mb-0.5">Траты за 30 дней, ₽</dt>
              <dd className="data-value text-ink-900">{guest.spend30d.toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt className="text-ink-400 text-xs mb-0.5">Зёрна</dt>
              <dd className="data-value text-ink-900">
                {guest.beansBalance.toLocaleString('ru-RU')}
                {countdown && !countdown.expired && (
                  <span className="block text-[11px] text-ink-400">
                    сгорят через {countdown.days} {pluralizeDays(countdown.days)}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {guest.card && (
            <p className="text-sm text-ink-900">
              💳 Карта: <span className="data-value">{guest.card.balance.toLocaleString('ru-RU')} ₽</span>
            </p>
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
                {guest.card ? 'Пополнить карту' : 'Продать карту'}
              </button>
              <button
                type="button"
                onClick={() => setAction('consume')}
                className="flex-[2] rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-3
                           hover:bg-ink-800 transition-colors"
              >
                Провести чек
              </button>
            </div>
          )}

          {action === 'sell' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-ink-400">Номинал карты-депозита (баланс не сгорает)</p>
              <div className="grid grid-cols-4 gap-2">
                {CARD_NOMINALS.map((option) => (
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
              <p className="text-[11px] text-ink-400">
                Покупка карты не даёт ни прогресса ранга, ни зёрен — только оплата с карты.
              </p>
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
                  {busy ? 'Продаём…' : `${guest.card ? 'Пополнить' : 'Продать'} за ${nominal.toLocaleString('ru-RU')} ₽`}
                </button>
              </div>
            </div>
          )}

          {action === 'consume' && (
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="consume-amount" className="block text-xs text-ink-400 mb-1.5">
                  Сумма чека, ₽
                </label>
                <input
                  id="consume-amount"
                  type="number"
                  min="0"
                  step="1"
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value)}
                  className={fieldClasses}
                />
              </div>

              <div>
                <label htmlFor="pay-beans" className="block text-xs text-ink-400 mb-1.5">
                  Списать зёрна (до 50% чека · доступно {guest.beansBalance.toLocaleString('ru-RU')})
                </label>
                <input
                  id="pay-beans"
                  type="number"
                  min="0"
                  step="1"
                  max={beansMax}
                  value={beansRedeem}
                  onChange={(e) => setBeansRedeem(e.target.value)}
                  placeholder="0"
                  className={fieldClasses}
                />
              </div>

              {guest.card && (
                <div>
                  <label className="flex items-center gap-2 text-xs text-ink-400 mb-1.5">
                    <input
                      type="checkbox"
                      checked={useCard}
                      onChange={(e) => setUseCard(e.target.checked)}
                      className="rounded border-ink-200"
                    />
                    Оплатить с карты (баланс {guest.card.balance.toLocaleString('ru-RU')} ₽)
                  </label>
                  {useCard && (
                    <input
                      id="pay-card-amount"
                      type="number"
                      min="0"
                      step="1"
                      max={cardMax}
                      value={cardPay}
                      onChange={(e) => setCardPay(e.target.value)}
                      placeholder={`До ${cardMax.toLocaleString('ru-RU')} ₽ — остаток наличными`}
                      className={fieldClasses}
                    />
                  )}
                </div>
              )}

              {grossValue > 0 && (
                <p className="text-xs text-ink-500 rounded-md bg-parchment-200 px-3 py-2.5">
                  К оплате:{' '}
                  {beansValue > 0 && <span className="data-value text-ink-900">{beansValue.toLocaleString('ru-RU')} зёрен</span>}
                  {beansValue > 0 && (cardValue > 0 || cashValue > 0) && ' + '}
                  {cardValue > 0 && <span className="data-value text-ink-900">{cardValue.toLocaleString('ru-RU')} ₽ с карты</span>}
                  {cardValue > 0 && cashValue > 0 && ' + '}
                  {cashValue > 0 && <span className="data-value text-ink-900">{cashValue.toLocaleString('ru-RU')} ₽ наличными</span>}
                  {earnPreview > 0 && (
                    <span className="block mt-1">→ кэшбэк {guest.effectiveRank?.beansPercent ?? 0}%: +{earnPreview} зёрен</span>
                  )}
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
                  id="consume-submit"
                  type="button"
                  onClick={handleConsume}
                  disabled={busy || grossValue <= 0}
                  className="flex-[2] rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-3
                             hover:bg-ink-800 transition-colors disabled:opacity-40"
                >
                  {busy ? 'Проводим…' : 'Провести чек'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
