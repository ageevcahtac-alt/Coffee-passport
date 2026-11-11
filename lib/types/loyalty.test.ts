import { describe, expect, it } from 'vitest';
import {
  beansCountdown,
  maxBeansForCheck,
  nextRankAbove,
  pluralizeDays,
  spendToNextRank,
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
