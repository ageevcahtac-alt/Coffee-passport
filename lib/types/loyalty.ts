// Loyalty — stage 1, контур «Зал» (ранги v2 + зёрна + карта-депозит + орден).
// App-level (camelCase) mirror of supabase/migrations/0039_loyalty_stage1_hall.sql,
// которая пересобрала модуль 0012 (0012-подписки и loyalty_transactions
// удалены; старые RPC loyalty_sell_subscription/loyalty_redeem — тоже).
// Как и раньше: модуль целиком Supabase-backed, без localStorage-фолбэка —
// баланс/ранг — shared server-authoritative state. See lib/data/loyalty.ts.

export const HALL_CIRCUIT = 'hall';

// Покупка/пополнение карты-депозита — фиксированные номиналы кофейни.
export const CARD_NOMINALS = [1000, 1500, 3000, 5000] as const;

// Правила из брифа владельца — одно место, отсюда читают UI и подписи.
export const RANK_WINDOW_DAYS = 30;
export const BEANS_EXPIRY_DAYS = 90;
export const WELCOME_BEANS = 300;
export const MAX_BEANS_SHARE_PERCENT = 50;

// История операций в ЛК: на экране — HISTORY_PREVIEW_COUNT последних строк,
// полный список — по кнопке «Посмотреть все чеки»; показываем операции
// не старше HISTORY_WINDOW_MONTHS месяцев (данные в базе не удаляются —
// только выборка; рангу нужны 30 дней, зёрнам 90 — окно безопасно).
export const HISTORY_PREVIEW_COUNT = 3;
export const HISTORY_WINDOW_MONTHS = 6;

export interface ShopRank {
  id: string;
  shopId: string;
  circuit: string;
  rankName: string;
  rankOrder: number;
  // Цвет ранга по шкале обжарки — им красятся значок, прогресс-бар и акценты.
  colorHex: string;
  // Кэшбэк зёрнами на чек, % (1 зерно = 1 ₽).
  beansPercent: number;
  // Порог — сумма трат за скользящие RANK_WINDOW_DAYS дней.
  requiredSpend30d: number;
}

export interface GuestShopStatus {
  id: string;
  guestId: string;
  shopId: string;
  // Кэш ранга на момент последнего чека (мгновенное повышение). Effective-ранг
  // read-time может быть ниже — его отдаёт RPC loyalty_effective_rank_id.
  currentRankId: string | null;
  // Орден: ручное назначение ранга из кабинета кофейни.
  ordenRankId: string | null;
  ordenPinned: boolean;
  lastPurchaseAt: string | null;
}

// Карта-депозит: одна на пару (гость, кофейня); баланс не сгорает никогда.
export interface DepositCard {
  id: string;
  guestId: string;
  shopId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export type BeansReason = 'welcome' | 'earn' | 'redeem';

export interface BeansEntry {
  id: string;
  guestId: string;
  shopId: string;
  delta: number;
  reason: BeansReason;
  consumptionId: string | null;
  createdAt: string;
}

// Потребление (чек): любой состав оплаты (наличные/зёрна/карта) — это чек;
// полный gross идёт в прогресс ранга и в базу кэшбэка.
export interface Consumption {
  id: string;
  guestId: string;
  shopId: string;
  baristaId: string | null;
  rankId: string | null;
  grossAmount: number;
  beansRedeemed: number;
  cardAmount: number;
  cashAmount: number;
  beansEarned: number;
  welcomeGranted: number;
  createdAt: string;
}

export type CardLedgerReason = 'topup' | 'spend';

export interface DepositCardLedgerEntry {
  id: string;
  cardId: string;
  delta: number;
  reason: CardLedgerReason;
  consumptionId: string | null;
  createdAt: string;
}

// Строка истории операций в ЛК гостя — склеена из журналов.
export interface LoyaltyHistoryItem {
  id: string;
  at: string;
  kind: 'consumption' | 'beans' | 'card';
  label: string;
  detail: string;
  shopId: string;
}

// Одна гостевая карточка кофейни — всё, что страница «Лояльность» рендерит
// для одного контура «Зал», pre-joined, чтобы UI не ходил across tables сам.
export interface GuestHallCard {
  shopId: string;
  status: GuestShopStatus | null;
  effectiveRank: ShopRank | null;
  ordenRank: ShopRank | null;
  isOrden: boolean;
  ranks: ShopRank[];
  nextRank: ShopRank | null;
  spend30d: number;
  beansBalance: number;
  beansExpireAt: string | null;
  card: DepositCard | null;
}

// Следующий ранг лестницы по тратам за 30 дней — null на вершине.
export function nextRankAbove(ranks: ShopRank[], spend30d: number): ShopRank | null {
  const above = ranks
    .filter((rank) => rank.requiredSpend30d > spend30d)
    .sort((a, b) => a.rankOrder - b.rankOrder);
  return above[0] ?? null;
}

// Остаток трат до следующего ранга (0 — порог достигнут/рангов нет).
export function spendToNextRank(nextRank: ShopRank | null, spend30d: number): number {
  if (!nextRank) return 0;
  return Math.max(0, nextRank.requiredSpend30d - spend30d);
}

// Обратный отсчёт до сгорания зёрен (последняя покупка + 90 дней). Null —
// покупок не было (значит и живых зёрен нет).
export interface BeansCountdown {
  days: number;
  hours: number;
  expired: boolean;
}

export function beansCountdown(expireAt: string | null, now: Date = new Date()): BeansCountdown | null {
  if (!expireAt) return null;
  const ms = new Date(expireAt).getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, expired: true };
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000), expired: false };
}

// Потолок зёрен на чек — половина (для превью у бариста до вызова RPC).
export function maxBeansForCheck(grossAmount: number): number {
  return Math.floor(grossAmount / 2);
}

// ── «Аномалии» (кабинет кофейни) ──────────────────────────────────────────
// Экран read-only прозрачности: запретов не вводим, владелец видит
// подозрительное глазами. Источник — тот же журнал loyalty_consumptions,
// что и у «Журнала чеков»; логику начислений здесь НЕТ — только выборки.
// Порог «чека выше нормы» — одна константа на весь экран (по умолчанию
// заметно выше среднего чека кофейни ~536 ₽).
export const ANOMALY_CHECK_THRESHOLD_RUBLES = 1500;
export const ANOMALY_TOP_GUESTS_LIMIT = 10;
export const ANOMALY_TALL_CHECKS_LIMIT = 50;
// Потолок выборки за месяц: больше — экран честно говорит, что данные окна
// неполные, а не молча режет (обе таблицы строятся из этих строк).
export const ANOMALY_FETCH_LIMIT = 1000;
// Скользящие окна — как у ранга (7/30 дней), не календарные.
export type AnomalyPeriod = 'week' | 'month';
export const ANOMALY_PERIOD_DAYS: Record<AnomalyPeriod, number> = { week: 7, month: 30 };

export interface TopCashbackGuest {
  guestId: string;
  // Кэшбэк за окно, зёрна (1 зерно = 1 ₽): только earn-процент с чека,
  // welcome-бонус сюда не входит — это не кэшбэк.
  earnedBeans: number;
  checksCount: number;
}

// Чеки внутри скользящего окна [now − days, now].
export function windowConsumptions(consumptions: Consumption[], days: number, now: Date = new Date()): Consumption[] {
  const sinceMs = now.getTime() - days * 86_400_000;
  return consumptions.filter((c) => new Date(c.createdAt).getTime() >= sinceMs);
}

// Топ гостей по начисленному кэшбэку за (уже оконченный) набор чеков.
// Порядок: по убыванию кэшбэка, при равенстве — по числу чеков.
export function topGuestsByCashback(
  consumptions: Consumption[],
  limit = ANOMALY_TOP_GUESTS_LIMIT,
): TopCashbackGuest[] {
  const byGuest = new Map<string, TopCashbackGuest>();
  for (const c of consumptions) {
    const entry = byGuest.get(c.guestId) ?? { guestId: c.guestId, earnedBeans: 0, checksCount: 0 };
    entry.earnedBeans += c.beansEarned;
    entry.checksCount += 1;
    byGuest.set(c.guestId, entry);
  }
  return [...byGuest.values()]
    .sort((a, b) => b.earnedBeans - a.earnedBeans || b.checksCount - a.checksCount)
    .slice(0, limit);
}

// Чеки строго выше порога (превышают — равный порогу не аномалия),
// по убыванию суммы, затем свежести; limit обрезает самое старое.
export function tallChecks(
  consumptions: Consumption[],
  threshold: number = ANOMALY_CHECK_THRESHOLD_RUBLES,
  limit: number = ANOMALY_TALL_CHECKS_LIMIT,
): Consumption[] {
  return consumptions
    .filter((c) => c.grossAmount > threshold)
    .sort(
      (a, b) =>
        b.grossAmount - a.grossAmount ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

export function pluralizeDays(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}
