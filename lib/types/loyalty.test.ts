import { describe, expect, it } from 'vitest';
import {
  ANOMALY_CHECK_THRESHOLD_RUBLES,
  ANOMALY_PERIOD_DAYS,
  beansCountdown,
  BEANS_EXPIRY_DAYS,
  HISTORY_PREVIEW_COUNT,
  HISTORY_WINDOW_MONTHS,
  MAX_BEANS_SHARE_PERCENT,
  maxBeansForCheck,
  nextRankAbove,
  pluralizeDays,
  RANK_WINDOW_DAYS,
  spendToNextRank,
  tallChecks,
  topGuestsByCashback,
  windowConsumptions,
  WELCOME_BEANS,
  type Consumption,
  type ShopRank,
} from '@/lib/types/loyalty';

// Чистые хелперы контура «Зал» (ранг — по тратам за 30 дней, зёрна — 1:1 к ₽,
// потолок 50% чека, сгорание через 90 дней от последней покупки). Серверная
// математика живёт в RPC (0039) — здесь только то, что рендерит UI.

function rank(id: string, rankOrder: number, requiredSpend30d: number): ShopRank {
  return {
    id,
    shopId: 'shop-xo-vsevolozhsk',
    circuit: 'hall',
    rankName: id,
    rankOrder,
    colorHex: '#6F4E37',
    beansPercent: 2,
    requiredSpend30d,
  };
}

const LADDER = [rank('r1', 0, 0), rank('r2', 1, 1000), rank('r3', 2, 2000), rank('r4', 3, 3000)];

describe('nextRankAbove — прогресс по тратам за 30 дней', () => {
  it('первый не достигнутый порог лестницы', () => {
    expect(nextRankAbove(LADDER, 0)?.id).toBe('r2');
    expect(nextRankAbove(LADDER, 1500)?.id).toBe('r3');
    expect(nextRankAbove(LADDER, 999)?.id).toBe('r2');
  });

  it('null на вершине лестницы', () => {
    expect(nextRankAbove(LADDER, 3000)).toBeNull();
    expect(nextRankAbove(LADDER, 50000)).toBeNull();
    expect(nextRankAbove([], 0)).toBeNull();
  });

  it('сортировка по rank_order, а не по порогу', () => {
    const shuffled = [rank('r4', 3, 3000), rank('r2', 1, 1000), rank('r3', 2, 2000)];
    expect(nextRankAbove(shuffled, 500)?.id).toBe('r2');
  });
});

describe('spendToNextRank — «осталось N ₽»', () => {
  it('разница до порога, не ниже нуля', () => {
    expect(spendToNextRank(LADDER[1], 250)).toBe(750);
    expect(spendToNextRank(LADDER[1], 1000)).toBe(0);
    expect(spendToNextRank(LADDER[1], 1200)).toBe(0);
    expect(spendToNextRank(null, 100)).toBe(0);
  });
});

describe('maxBeansForCheck — потолок 50% чека', () => {
  it('половина чека, округление вниз на нечётных копейках', () => {
    expect(maxBeansForCheck(1000)).toBe(500);
    expect(maxBeansForCheck(317)).toBe(158);
    expect(maxBeansForCheck(1)).toBe(0);
    expect(maxBeansForCheck(0)).toBe(0);
  });
});

describe('beansCountdown — таймер сгорания', () => {
  const now = new Date('2026-11-11T12:00:00Z');

  it('дни и часы до дедлайна', () => {
    expect(beansCountdown('2026-12-01T00:00:00Z', now)).toEqual({ days: 19, hours: 12, expired: false });
    expect(beansCountdown('2026-11-11T13:00:00Z', now)).toEqual({ days: 0, hours: 1, expired: false });
  });

  it('просроченный дедлайн и его отсутствие', () => {
    expect(beansCountdown('2026-11-01T00:00:00Z', now)).toEqual({ days: 0, hours: 0, expired: true });
    expect(beansCountdown(null, now)).toBeNull();
  });
});

describe('pluralizeDays', () => {
  it('русские склонения', () => {
    expect(pluralizeDays(1)).toBe('день');
    expect(pluralizeDays(2)).toBe('дня');
    expect(pluralizeDays(5)).toBe('дней');
    expect(pluralizeDays(11)).toBe('дней');
    expect(pluralizeDays(21)).toBe('день');
    expect(pluralizeDays(22)).toBe('дня');
  });
});

describe('константы правил лояльности — одно место для UI и подписей', () => {
  it('окна: ранг 30 дней, зёрна 90 дней, история 6 месяцев', () => {
    expect(RANK_WINDOW_DAYS).toBe(30);
    expect(BEANS_EXPIRY_DAYS).toBe(90);
    expect(HISTORY_WINDOW_MONTHS).toBe(6);
    // Окно истории шире окон ранга и зёрен — метрики от него не ломаются.
    expect(HISTORY_WINDOW_MONTHS * 30).toBeGreaterThan(BEANS_EXPIRY_DAYS);
    expect(HISTORY_WINDOW_MONTHS * 30).toBeGreaterThan(RANK_WINDOW_DAYS);
  });

  it('история в ЛК: превью 3 строки, welcome 300, потолок зёрен 50%', () => {
    expect(HISTORY_PREVIEW_COUNT).toBe(3);
    expect(WELCOME_BEANS).toBe(300);
    expect(MAX_BEANS_SHARE_PERCENT).toBe(50);
  });
});

// Заводка чека для тестов аномалий — только поля, которые читают агрегаторы.
function check(overrides: Partial<Consumption> & { guestId: string }): Consumption {
  return {
    id: `c-${overrides.guestId}-${overrides.grossAmount ?? 100}`,
    shopId: 'shop-xo-vsevolozhsk',
    baristaId: 'barista-1',
    rankId: null,
    grossAmount: 100,
    beansRedeemed: 0,
    cardAmount: 0,
    cashAmount: 100,
    beansEarned: 2,
    welcomeGranted: 0,
    createdAt: '2026-11-10T12:00:00Z',
    ...overrides,
  };
}

describe('аномалии — порог чека «выше нормы»', () => {
  it('строгое превышение: равный порогу чек не аномалия', () => {
    const rows = [check({ guestId: 'g1', grossAmount: 1500 }), check({ guestId: 'g2', grossAmount: 1501 })];
    const tall = tallChecks(rows);
    expect(tall.map((c) => c.grossAmount)).toEqual([1501]);
  });

  it('порог — константа одного места (по умолчанию 1500 ₽) и её можно переопределить', () => {
    expect(ANOMALY_CHECK_THRESHOLD_RUBLES).toBe(1500);
    const rows = [check({ guestId: 'g1', grossAmount: 900 })];
    expect(tallChecks(rows, 500).map((c) => c.grossAmount)).toEqual([900]);
  });

  it('сортировка по убыванию суммы, при равенстве — свежее первым, limit обрезает', () => {
    const rows = [
      check({ guestId: 'g1', grossAmount: 2000, createdAt: '2026-11-01T09:00:00Z' }),
      check({ guestId: 'g2', grossAmount: 3000, createdAt: '2026-11-01T08:00:00Z' }),
      check({ guestId: 'g3', grossAmount: 2000, createdAt: '2026-11-05T09:00:00Z' }),
      check({ guestId: 'g4', grossAmount: 5000, createdAt: '2026-10-01T09:00:00Z' }),
    ];
    const tall = tallChecks(rows, 1500, 3);
    expect(tall.map((c) => c.guestId)).toEqual(['g4', 'g2', 'g3']);
  });
});

describe('аномалии — скользящее окно периода', () => {
  const now = new Date('2026-11-11T12:00:00Z');

  it('неделя 7 дней, месяц 30 дней — граница включена', () => {
    expect(ANOMALY_PERIOD_DAYS).toEqual({ week: 7, month: 30 });
    const edge = check({ guestId: 'g1', createdAt: '2026-11-04T12:00:00Z' });
    const beforeEdge = check({ guestId: 'g2', createdAt: '2026-11-04T11:59:59Z' });
    expect(windowConsumptions([edge, beforeEdge], ANOMALY_PERIOD_DAYS.week, now).map((c) => c.guestId)).toEqual(['g1']);
    const monthEdge = check({ guestId: 'g3', createdAt: '2026-10-12T12:00:00Z' });
    expect(windowConsumptions([monthEdge], ANOMALY_PERIOD_DAYS.month, now)).toHaveLength(1);
  });
});

describe('аномалии — топ гостей по кэшбэку', () => {
  it('суммирует earn-процент по гостю, welcome не считает кэшбэком, считает чеки', () => {
    const rows = [
      check({ guestId: 'g1', grossAmount: 1000, beansEarned: 20, createdAt: '2026-11-10T10:00:00Z' }),
      check({ guestId: 'g1', grossAmount: 500, beansEarned: 10, welcomeGranted: 300, createdAt: '2026-11-10T11:00:00Z' }),
      check({ guestId: 'g2', grossAmount: 2000, beansEarned: 40, createdAt: '2026-11-09T10:00:00Z' }),
    ];
    const top = topGuestsByCashback(rows);
    expect(top).toEqual([
      { guestId: 'g2', earnedBeans: 40, checksCount: 1 },
      { guestId: 'g1', earnedBeans: 30, checksCount: 2 },
    ]);
  });

  it('при равном кэшбэке выше тот, у кого больше чеков; лимит обрезает', () => {
    const rows = [
      check({ guestId: 'g1', beansEarned: 10, createdAt: '2026-11-10T10:00:00Z' }),
      check({ guestId: 'g1', beansEarned: 10, createdAt: '2026-11-10T11:00:00Z' }),
      check({ guestId: 'g2', beansEarned: 20, createdAt: '2026-11-10T09:00:00Z' }),
      check({ guestId: 'g3', beansEarned: 5, createdAt: '2026-11-10T08:00:00Z' }),
    ];
    const top = topGuestsByCashback(rows, 2);
    // Кэшбэк равен (20): у g1 два чека — он выше; g3 (5) лимитом отрезан.
    expect(top.map((t) => t.guestId)).toEqual(['g1', 'g2']);
  });

  it('гость без чеков в выборку не попадает', () => {
    expect(topGuestsByCashback([])).toEqual([]);
  });
});
