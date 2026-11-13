'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  favoriteDrink: string | null;
  status: GuestShopStatus | null;
  ranks: ShopRank[];
  effectiveRank: ShopRank | null;
  spend30d: number;
  beansBalance: number;
  beansExpireAt: string | null;
  card: DepositCard | null;
}

type Mode = 'idle' | 'scanning' | 'guest';
type Action = null | 'sell';
type Plan = 'card' | 'beans' | 'earn';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const fmt = (value: number) => value.toLocaleString('ru-RU');

// Barista's loyalty console (stage 1, контур «Зал»): scan a guest's QR →
// карточка гостя (имя + любимый напиток крупно) → сумма чека → три действия:
//   💳 списать с карты (частичное списание, нехватка — доплата живыми);
//   ☕ списать зёрна (≤ 50% чека, остаток — доплата);
//   ✨ только начислить кэшбэк.
// Каждое действие — с модальным подтверждением итога. Все правила (потолок
// 50%, clamp к балансам, кэшбэк на денежную часть, приветственные 300) — в
// RPC loyalty_consume (0039/0040/0046); этот компонент рисует, что сервер
// вернул, и глушит двойной тап рефом-in-flight, чтобы повторное нажатие не
// провело чек дважды.
export function BaristaLoyaltyPanel({ shopId }: { shopId: string }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState('');
  const [guest, setGuest] = useState<GuestContext | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Sell/top-up form
  const [nominal, setNominal] = useState<number>(CARD_NOMINALS[0]);

  // Consume plan: сумма чека + открытая модалка действия
  const [grossAmount, setGrossAmount] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [beansInput, setBeansInput] = useState('');

  // resetForm=false — рефреш ПОСЛЕ продажи/чека: форму и сообщение об итоге
  // не трогаем. Иначе гонка: бариста вбивает сумму следующего чека, а
  // долетающий ответ fetchGuestShopContext стирает поле (setGrossAmount(''))
  // и дизейблит кнопки — операция «зависает» до ручного сброса. См. баг
  // verify-barista-access (run 43451583228).
  async function loadGuest(guestId: string, options?: { resetForm?: boolean }) {
    const resetForm = options?.resetForm ?? true;
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
      favoriteDrink: profile.favoriteDrink,
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
    if (resetForm) {
      setMessage(null);
      setGrossAmount('');
      setPlan(null);
      setBeansInput('');
    }
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
    setPlan(null);
    setBeansInput('');
  }

  async function handleSell() {
    if (!guest || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await purchaseCard(guest.id, shopId, nominal);
    setBusy(false);
    inFlight.current = false;
    if (result.ok) {
      setMessage({
        kind: 'ok',
        text: `Карта на ${fmt(nominal)} ₽ ${result.card && guest.card ? 'пополнена' : 'продана'}. Баланс: ${fmt(result.card?.balance ?? 0)} ₽. Ранг и зёрна не изменились.`,
      });
      void loadGuest(guest.id, { resetForm: false });
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось продать карту.' });
    }
    setAction(null);
  }

  const grossValue = Number(grossAmount) || 0;
  const rankPercent = guest?.effectiveRank?.beansPercent ?? 0;
  const beansMax = guest ? Math.min(maxBeansForCheck(grossValue), guest.beansBalance) : 0;
  // Превью считаем от клиентского clamp; в RPC уходит введённое значение —
  // сервер и есть источник истины (потолок 50%/баланс), итог бариста видит
  // в сообщении по факту ответа.
  const beansTyped = Math.max(0, Number(beansInput) || 0);
  const beansPlanned = Math.min(beansTyped, beansMax);
  const cardPlanned = guest?.card ? Math.min(grossValue, guest.card.balance) : 0;
  const cardCash = Math.max(0, grossValue - cardPlanned);
  const beansCash = Math.max(0, grossValue - beansPlanned);
  const earnOnCard = Math.round((grossValue * rankPercent) / 100);
  const earnOnBeans = Math.round(((grossValue - beansPlanned) * rankPercent) / 100);
  const countdown = guest ? beansCountdown(guest.beansExpireAt) : null;

  function openPlan(next: Plan) {
    if (next === 'beans') setBeansInput(String(beansMax));
    setPlan(next);
  }

  async function handleConfirmPlan() {
    if (!guest || !plan || inFlight.current || grossValue <= 0) return;
    inFlight.current = true;
    setBusy(true);
    const args =
      plan === 'card'
        ? { beans: 0, card: grossValue }
        : plan === 'beans'
          ? { beans: beansTyped, card: 0 }
          : { beans: 0, card: 0 };
    const result = await consume(guest.id, shopId, grossValue, args.beans, args.card);
    setBusy(false);
    inFlight.current = false;
    setPlan(null);
    if (result.ok && result.result) {
      const { consumption, beansBalanceAfter } = result.result;
      const parts = [
        consumption.cardAmount > 0 ? `с карты ${fmt(consumption.cardAmount)} ₽` : null,
        consumption.beansRedeemed > 0 ? `списано ${fmt(consumption.beansRedeemed)} зёрен` : null,
        consumption.cashAmount > 0 ? `доплата живыми ${fmt(consumption.cashAmount)} ₽` : null,
        consumption.beansEarned > 0 ? `кэшбэк +${fmt(consumption.beansEarned)} зёрен` : null,
        consumption.welcomeGranted > 0 ? `приветственные +${fmt(consumption.welcomeGranted)} зёрен` : null,
      ].filter(Boolean);
      setMessage({
        kind: 'ok',
        text: `Чек проведён: ${parts.join(' · ') || 'без начислений'}. Баланс зёрен: ${fmt(beansBalanceAfter)}.`,
      });
      setGrossAmount('');
      setBeansInput('');
      void loadGuest(guest.id, { resetForm: false });
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось провести чек.' });
    }
  }

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
            <div className="min-w-0">
              <h3 className="font-display text-2xl text-ink-900 leading-tight">
                {guest.displayName || 'Гость без имени'}
              </h3>
              {guest.favoriteDrink ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-gold-400/10 border border-gold-300 px-3 py-1 text-sm text-ink-900">
                  ☕ <span className="font-medium">{guest.favoriteDrink}</span>
                  <span className="text-[11px] text-ink-400">— как обычно?</span>
                </p>
              ) : (
                <p className="text-xs text-ink-400 mt-1.5">Любимый напиток не указан</p>
              )}
              <p className="text-xs text-ink-400 mt-2">
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
              <dd className="data-value text-ink-900">{fmt(guest.spend30d)}</dd>
            </div>
            <div>
              <dt className="text-ink-400 text-xs mb-0.5">Зёрна</dt>
              <dd className="data-value text-ink-900">
                {fmt(guest.beansBalance)}
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
              💳 Карта: <span className="data-value">{fmt(guest.card.balance)} ₽</span>
            </p>
          )}

          {message && (
            <p className={`text-sm ${message.kind === 'ok' ? 'text-moss-700' : 'text-ink-500'}`}>
              {message.kind === 'ok' ? '✓ ' : '⚠ '}
              {message.text}
            </p>
          )}

          {action === null && (
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {guest.card && (
                  <button
                    type="button"
                    onClick={() => openPlan('card')}
                    disabled={grossValue <= 0 || busy}
                    className="rounded-md border border-gold-300 bg-gold-400/10 text-ink-900 text-sm px-3 py-3
                               hover:bg-gold-400/20 transition-colors disabled:opacity-40"
                  >
                    💳 Списать с карты
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openPlan('beans')}
                  disabled={grossValue <= 0 || busy}
                  className="rounded-md border border-ink-200 text-ink-700 text-sm px-3 py-3
                             hover:bg-parchment-300 transition-colors disabled:opacity-40"
                >
                  ☕ Списать зёрна
                </button>
                <button
                  type="button"
                  onClick={() => openPlan('earn')}
                  disabled={grossValue <= 0 || busy}
                  className="rounded-md bg-ink-900 text-parchment-100 text-sm px-3 py-3
                             hover:bg-ink-800 transition-colors disabled:opacity-40"
                >
                  ✨ Только начислить
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAction('sell')}
                className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 self-start"
              >
                {guest.card ? 'Пополнить карту' : 'Продать карту-депозит'}
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
                    {fmt(option)} ₽
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
                  {busy ? 'Продаём…' : `${guest.card ? 'Пополнить' : 'Продать'} за ${fmt(nominal)} ₽`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {plan && guest && grossValue > 0 && (
        <ConfirmPlanModal
          title={
            plan === 'card' ? 'Списать с карты' : plan === 'beans' ? 'Списать зёрна' : 'Только начислить кэшбэк'
          }
          onClose={() => setPlan(null)}
          onConfirm={handleConfirmPlan}
          busy={busy}
        >
          {plan === 'card' && guest.card && (
            <div className="flex flex-col gap-2 text-sm text-ink-700">
              <PlanRow label="Чек" value={`${fmt(grossValue)} ₽`} />
              <PlanRow label="С карты" value={`${fmt(cardPlanned)} ₽ (баланс ${fmt(guest.card.balance)} ₽)`} />
              {cardCash > 0 && <PlanRow label="Доплата живыми" value={`${fmt(cardCash)} ₽`} accent />}
              {cardCash === 0 && <PlanRow label="Доплата живыми" value="не нужна" />}
              <PlanRow label="Кэшбэк" value={`+${fmt(earnOnCard)} зёрен (${rankPercent}%)`} />
              <p className="text-[11px] text-ink-400">
                Прогресс ранга идёт на всю сумму чека. Баланса не хватит — спишется весь остаток.
              </p>
            </div>
          )}
          {plan === 'beans' && (
            <div className="flex flex-col gap-2 text-sm text-ink-700">
              <PlanRow label="Чек" value={`${fmt(grossValue)} ₽`} />
              <label className="block">
                <span className="block text-xs text-ink-400 mb-1.5">
                  Зёрнами (максимум {fmt(beansMax)} — 50% чека, доступно {fmt(guest.beansBalance)})
                </span>
                <input
                  id="plan-beans"
                  type="number"
                  min="0"
                  step="1"
                  max={beansMax}
                  value={beansInput}
                  onChange={(e) => setBeansInput(e.target.value)}
                  disabled={beansMax === 0}
                  placeholder={beansMax === 0 ? 'Нет живых зёрен' : '0'}
                  className={fieldClasses}
                />
              </label>
              <PlanRow label="Доплата живыми" value={`${fmt(beansCash)} ₽`} accent />
              <PlanRow label="Кэшбэк на денежную часть" value={`+${fmt(earnOnBeans)} зёрен (${rankPercent}%)`} />
            </div>
          )}
          {plan === 'earn' && (
            <div className="flex flex-col gap-2 text-sm text-ink-700">
              <PlanRow label="Чек" value={`${fmt(grossValue)} ₽`} />
              <PlanRow label="Списаний" value="нет" />
              <PlanRow label="Кэшбэк" value={`+${fmt(earnOnCard)} зёрен (${rankPercent}%)`} accent />
            </div>
          )}
        </ConfirmPlanModal>
      )}
    </div>
  );
}

function PlanRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className={`data-value text-right ${accent ? 'text-ink-900' : 'text-ink-700'}`}>{value}</span>
    </div>
  );
}

function ConfirmPlanModal({
  title,
  children,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 px-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-md bg-parchment-100 p-5"
      >
        <p className="font-display text-lg text-ink-900 mb-3">{title}</p>
        <div className="mb-5">{children}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-md border border-ink-200 text-ink-700 text-sm px-4 py-3
                       hover:bg-parchment-300 transition-colors disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-[2] rounded-md bg-ink-900 text-parchment-100 text-sm px-4 py-3
                       hover:bg-ink-800 transition-colors disabled:opacity-40"
          >
            {busy ? 'Проводим…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}
