import { describe, expect, it } from 'vitest';
import {
  computeCafeRatingSummary,
  emptyCafeRatingSummary,
  formatBeans,
  formatRatingsCount,
  isGoodPlace,
  parseCafeRatingInput,
} from './cafeRatings';

// Агрегаты и значок «Хорошее место — кофейное место» (0052): средний балл
// (шаг 0,1), распределение 1–5, значок на границах 4,5 и минимума оценок.
// Эти же функции кормят кабинет кофейни — гистограмма обязана совпадать
// с публичным summary RPC (один источник пересчёта).

describe('computeCafeRatingSummary', () => {
  it('returns an empty summary for no ratings', () => {
    expect(computeCafeRatingSummary([])).toEqual({ average: null, count: 0, distribution: [0, 0, 0, 0, 0] });
  });

  it('rounds the average to a 0.1 step', () => {
    // 5+5+4 = 14/3 = 4.666… → 4.7
    expect(computeCafeRatingSummary([{ score: 5 }, { score: 5 }, { score: 4 }]).average).toBe(4.7);
    // 5+4+4+4 = 17/4 = 4.25 → 4.2 или 4.3 по банковскому округлению не должно плавать: JS round → 4.3
    expect(computeCafeRatingSummary([{ score: 5 }, { score: 4 }, { score: 4 }, { score: 4 }]).average).toBe(4.3);
    expect(computeCafeRatingSummary([{ score: 3 }, { score: 4 }]).average).toBe(3.5);
  });

  it('builds the 1–5 distribution in score order', () => {
    const summary = computeCafeRatingSummary([
      { score: 5 },
      { score: 1 },
      { score: 5 },
      { score: 3 },
      { score: 1 },
      { score: 1 },
    ]);
    expect(summary.count).toBe(6);
    expect(summary.distribution).toEqual([3, 0, 1, 0, 2]);
  });

  it('ignores out-of-range rows instead of crashing', () => {
    const summary = computeCafeRatingSummary([{ score: 5 }, { score: 0 }, { score: 6 }, { score: NaN }]);
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(5);
  });
});

describe('isGoodPlace (средний ≥ 4,5 И минимум 3 оценки)', () => {
  it('is false without ratings', () => {
    expect(isGoodPlace(emptyCafeRatingSummary())).toBe(false);
  });

  it('is false on the 4.5 boundary with fewer than 3 ratings (защита от «один друг поставил 5»)', () => {
    // 5+4 = 4.5, но оценок только две.
    expect(isGoodPlace(computeCafeRatingSummary([{ score: 5 }, { score: 4 }]))).toBe(false);
  });

  it('is true exactly at 4.5 with at least 3 ratings', () => {
    // 5+5+4+4 = 18/4 = 4.5 ровно; целыми зёрнами 4.5 с тремя оценками не
    // собрать (4.333 / 4.666), поэтому граница среднего проверяется на
    // четырёх оценках, а минимум оценок — отдельным кейсом ниже.
    expect(isGoodPlace(computeCafeRatingSummary([{ score: 5 }, { score: 5 }, { score: 4 }, { score: 4 }]))).toBe(true);
    expect(isGoodPlace(computeCafeRatingSummary([{ score: 5 }, { score: 5 }, { score: 4 }]))).toBe(true);
  });

  it('is false just below 4.5 even with many ratings', () => {
    // 4+4+4+5+4+4 / 6 = 4.166… → 4.2
    expect(isGoodPlace(computeCafeRatingSummary([{ score: 4 }, { score: 4 }, { score: 4 }, { score: 5 }, { score: 4 }, { score: 4 }]))).toBe(false);
    // 4.4 после округления: 4+4+5 = 13/3 = 4.333 → 4.3
    expect(isGoodPlace(computeCafeRatingSummary([{ score: 4 }, { score: 4 }, { score: 5 }]))).toBe(false);
  });

  it('is false for a single 5 (средний 5.0, но одна оценка)', () => {
    expect(isGoodPlace(computeCafeRatingSummary([{ score: 5 }]))).toBe(false);
  });
});

describe('formatBeans / formatRatingsCount', () => {
  it('declinates beans', () => {
    expect(formatBeans(1)).toBe('1 зерно');
    expect(formatBeans(2)).toBe('2 зёрна');
    expect(formatBeans(3)).toBe('3 зёрна');
    expect(formatBeans(4)).toBe('4 зёрна');
    expect(formatBeans(5)).toBe('5 зёрен');
  });

  it('declinates rating counts', () => {
    expect(formatRatingsCount(1)).toBe('1 оценка');
    expect(formatRatingsCount(2)).toBe('2 оценки');
    expect(formatRatingsCount(5)).toBe('5 оценок');
    expect(formatRatingsCount(11)).toBe('11 оценок');
    expect(formatRatingsCount(21)).toBe('21 оценка');
  });
});

describe('parseCafeRatingInput', () => {
  it('accepts a bare score (оценка без текста — законна)', () => {
    expect(parseCafeRatingInput(4, '')).toEqual({ ok: true, score: 4, review: null });
    expect(parseCafeRatingInput(5, null)).toEqual({ ok: true, score: 5, review: null });
    expect(parseCafeRatingInput(1, '   ')).toEqual({ ok: true, score: 1, review: null });
  });

  it('trims the review text', () => {
    expect(parseCafeRatingInput(3, '  отличный фильтр  ')).toEqual({ ok: true, score: 3, review: 'отличный фильтр' });
  });

  it('rejects a missing or out-of-range score', () => {
    expect(parseCafeRatingInput(0, '')).toMatchObject({ ok: false });
    expect(parseCafeRatingInput(6, '')).toMatchObject({ ok: false });
    expect(parseCafeRatingInput(2.5, '')).toMatchObject({ ok: false });
    expect(parseCafeRatingInput(NaN, '')).toMatchObject({ ok: false });
    expect(parseCafeRatingInput('4', '')).toMatchObject({ ok: false });
  });

  it('rejects an over-long review', () => {
    expect(parseCafeRatingInput(4, 'а'.repeat(1001))).toMatchObject({ ok: false });
    expect(parseCafeRatingInput(4, 'а'.repeat(1000))).toMatchObject({ ok: true });
  });
});
