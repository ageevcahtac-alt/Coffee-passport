// Рейтинг кофеен «зёрнами» — доменные типы и чистые функции.
// Единое место для констант правил владельца и пересчёта агрегатов из строк
// cafe_ratings (0052): публичная карточка на /map, кабинет кофейни и тесты
// считают средний балл, распределение и значок из одних и тех же функций,
// поэтому «один друг поставил 5 — и значок» ломается ровно в одном месте.
//
// Агрегаты хранятся НЕ в базе: summary RPC (cafe_rating_summary) считает их
// на чтении, кабинет пересчитывает из выбранных строк через computeCafeRatingSummary
// — мгновенно актуально после постановки/удаления, без триггеров.

// Правило значка «Хорошее место — кофейное место» (владелец): средний балл
// не ниже 4,5 И минимум 3 активные оценки. Менять — только здесь.
export const CAFE_RATING_GOOD_PLACE_MIN_AVERAGE = 4.5;
export const CAFE_RATING_GOOD_PLACE_MIN_RATINGS = 3;

export const CAFE_RATING_MIN_SCORE = 1;
export const CAFE_RATING_MAX_SCORE = 5;
export const CAFE_RATING_MAX_REVIEW_LENGTH = 1000;
// Публичный список отзывов в карточке: больше всё равно листать некуда.
export const CAFE_RATING_PUBLIC_REVIEWS_LIMIT = 50;

export type CafeRatingScore = 1 | 2 | 3 | 4 | 5;

// Число активных оценок каждого значения 1..5 (индекс = score - 1).
export type CafeRatingDistribution = [number, number, number, number, number];

export type CafeRatingSummary = {
  // Средний балл, шаг 0,1; null — активных оценок нет.
  average: number | null;
  count: number;
  distribution: CafeRatingDistribution;
};

export type CafeReview = {
  score: CafeRatingScore;
  review: string | null;
  authorName: string;
  createdAt: string;
};

export function emptyCafeRatingSummary(): CafeRatingSummary {
  return { average: null, count: 0, distribution: [0, 0, 0, 0, 0] };
}

// Пересчёт агрегатов из активных строк (только deleted_at is null — фильтр
// делает SQL/кабинет до вызова). Средний округляется до 0,1, как в RPC.
export function computeCafeRatingSummary(rows: { score: number }[]): CafeRatingSummary {
  const summary = emptyCafeRatingSummary();
  if (rows.length === 0) return summary;
  let total = 0;
  for (const row of rows) {
    const score = Math.trunc(row.score);
    if (!Number.isFinite(score) || score < CAFE_RATING_MIN_SCORE || score > CAFE_RATING_MAX_SCORE) continue;
    summary.distribution[score - 1] += 1;
    total += score;
  }
  summary.count = summary.distribution.reduce((sum, count) => sum + count, 0);
  if (summary.count > 0) {
    summary.average = Math.round((total / summary.count) * 10) / 10;
  }
  return summary;
}

// Значок «Хорошее место — кофейное место»: средний ≥ 4,5 И ≥ 3 оценок.
// Сравнение по уже округлённому до 0,1 среднему — ровно то число, которое
// видят гости на карточке, без второго округления.
export function isGoodPlace(summary: CafeRatingSummary): boolean {
  return (
    summary.average !== null &&
    summary.average >= CAFE_RATING_GOOD_PLACE_MIN_AVERAGE &&
    summary.count >= CAFE_RATING_GOOD_PLACE_MIN_RATINGS
  );
}

// Склонение: 1 зерно / 2 зёрна / 5 зёрен.
export function formatBeans(score: number): string {
  const n = Math.trunc(score);
  const mod100 = Math.abs(n) % 100;
  const mod10 = Math.abs(n) % 10;
  if (mod100 >= 11 && mod100 <= 19) return `${n} зёрен`;
  if (mod10 === 1) return `${n} зерно`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} зёрна`;
  return `${n} зёрен`;
}

// Склонение для счётчика оценок: 1 оценка / 2 оценки / 5 оценок.
export function formatRatingsCount(count: number): string {
  const n = Math.trunc(count);
  const mod100 = Math.abs(n) % 100;
  const mod10 = Math.abs(n) % 10;
  if (mod100 >= 11 && mod100 <= 19) return `${n} оценок`;
  if (mod10 === 1) return `${n} оценка`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} оценки`;
  return `${n} оценок`;
}

// Валидация ввода формы оценки (то, что второй раз проверяет RPC cafe_rate).
export function parseCafeRatingInput(
  score: unknown,
  review: unknown
): { ok: true; score: CafeRatingScore; review: string | null } | { ok: false; error: string } {
  const value = typeof score === 'number' ? score : NaN;
  if (!Number.isInteger(value) || value < CAFE_RATING_MIN_SCORE || value > CAFE_RATING_MAX_SCORE) {
    return { ok: false, error: 'Выберите от 1 до 5 зёрен.' };
  }
  const text = typeof review === 'string' ? review.trim() : '';
  if (text.length > CAFE_RATING_MAX_REVIEW_LENGTH) {
    return { ok: false, error: `Отзыв слишком длинный: максимум ${CAFE_RATING_MAX_REVIEW_LENGTH} символов.` };
  }
  return { ok: true, score: value as CafeRatingScore, review: text === '' ? null : text };
}
