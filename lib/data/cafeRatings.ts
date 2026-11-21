'use client';

import type { CafeRatingRow } from '@/lib/types/database';
import type { CafeRatingScore, CafeRatingSummary, CafeReview } from '@/lib/types/cafeRatings';
import { CAFE_RATING_PUBLIC_REVIEWS_LIMIT } from '@/lib/types/cafeRatings';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// Cafe ratings «зёрнами» (0052) — клиентский слой поверх RPC и RLS.
// Все функции — тонкие, defensively-failing обёртки в духе lib/data/loyalty.ts:
// неудавшееся чтение возвращает null/пустоту (офлайн или отказ RLS
// деградирует в «нет данных», а не в краш), каждая запись возвращает
// { ok, error? } — вызывающий показывает error как есть. Правила (роль
// enthusiast, партнёрство кофейни, одна активная оценка) — только в телах
// RPC; здесь их не дублируем, только валидируем ввод для мгновенной
// подсветки (parseCafeRatingInput).

type RateResult = { ok: true } | { ok: false; error: string };

function rpcError(payload: Record<string, unknown> | null, fallback: string): RateResult {
  if (payload && typeof payload === 'object' && typeof payload.ok === 'boolean') {
    if (payload.ok) return { ok: true };
    const message = typeof payload.error === 'string' && payload.error ? payload.error : fallback;
    return { ok: false, error: message };
  }
  return { ok: false, error: fallback };
}

export async function rateCafe(cafeId: string, score: CafeRatingScore, review: string | null): Promise<RateResult> {
  const { data, error } = await getBrowserSupabaseClient().rpc('cafe_rate', {
    p_cafe_id: cafeId,
    p_score: score,
    p_review: review,
  });
  if (error) return { ok: false, error: 'Не удалось сохранить оценку. Попробуйте ещё раз.' };
  return rpcError(data as Record<string, unknown> | null, 'Не удалось сохранить оценку.');
}

export async function deleteCafeRating(cafeId: string): Promise<RateResult> {
  const { data, error } = await getBrowserSupabaseClient().rpc('cafe_unrate', { p_cafe_id: cafeId });
  if (error) return { ok: false, error: 'Не удалось удалить оценку. Попробуйте ещё раз.' };
  return rpcError(data as Record<string, unknown> | null, 'Не удалось удалить оценку.');
}

// Публичный summary карточки. RPC возвращает {average, count, distribution}
// даже при нуле оценок; null здесь — только сбой чтения.
export async function fetchCafeRatingSummary(cafeId: string): Promise<CafeRatingSummary | null> {
  const { data, error } = await getBrowserSupabaseClient().rpc('cafe_rating_summary', { p_cafe_id: cafeId });
  if (error || !data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const count = typeof payload.count === 'number' && Number.isFinite(payload.count) ? payload.count : 0;
  const rawDistribution = Array.isArray(payload.distribution) ? payload.distribution : [];
  const distribution = [0, 0, 0, 0, 0].map(
    (_, index) => (typeof rawDistribution[index] === 'number' ? (rawDistribution[index] as number) : 0) as number
  ) as CafeRatingSummary['distribution'];
  const rawAverage = payload.average;
  const average =
    typeof rawAverage === 'number' && Number.isFinite(rawAverage) && count > 0 ? Math.round(rawAverage * 10) / 10 : null;
  return { average, count, distribution };
}

// Публичный список отзывов (только строки с текстом, имя автора уже внутри).
export async function fetchCafeRatingReviews(cafeId: string, limit = CAFE_RATING_PUBLIC_REVIEWS_LIMIT): Promise<CafeReview[]> {
  const { data, error } = await getBrowserSupabaseClient().rpc('cafe_rating_reviews', {
    p_cafe_id: cafeId,
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) return [];
  return (data as { score: number; review: string | null; author_name: string; created_at: string }[]).map((row) => ({
    score: Math.trunc(row.score) as CafeRatingScore,
    review: typeof row.review === 'string' ? row.review : null,
    authorName: typeof row.author_name === 'string' ? row.author_name : 'Гость без имени',
    createdAt: row.created_at,
  }));
}

// Состояние «уже оценил» гостя: RLS отдаёт не больше его собственной
// активной строки. Аноним (без grant на таблицу) получает ошибку — null.
export async function fetchOwnCafeRating(cafeId: string): Promise<{ score: CafeRatingScore; review: string | null } | null> {
  const { data, error } = await getBrowserSupabaseClient()
    .from('cafe_ratings')
    .select('score, review')
    .eq('cafe_id', cafeId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<CafeRatingRow, 'score' | 'review'>;
  return { score: Math.trunc(row.score) as CafeRatingScore, review: row.review };
}

// Кабинет кофейни: все активные оценки своей кофейни (RLS staff own shop),
// включая user_id для сведения имён из profiles той же политикой, что
// «staff read enthusiast display names» (0012). Пагинация по 1000: без неё
// PostgREST обрезал бы выборку лимитом строк и кабинет считал бы среднее
// и гистограмму не по всем оценкам.
const SHOP_RATINGS_PAGE = 1000;
// Потолок — страховка от бесконечного цикла; 20k активных оценок на одну
// кофейню за пределами пилота.
const SHOP_RATINGS_CAP = 20_000;

export async function fetchShopCafeRatings(cafeId: string): Promise<CafeRatingRow[]> {
  const client = getBrowserSupabaseClient();
  const rows: CafeRatingRow[] = [];
  for (let from = 0; from < SHOP_RATINGS_CAP; from += SHOP_RATINGS_PAGE) {
    const { data, error } = await client
      .from('cafe_ratings')
      .select('id, cafe_id, user_id, score, review, created_at, deleted_at')
      .eq('cafe_id', cafeId)
      .order('created_at', { ascending: false })
      .range(from, from + SHOP_RATINGS_PAGE - 1);
    if (!Array.isArray(data)) return rows; // сбой страницы — отдаём дочитанное
    rows.push(...(data as unknown as CafeRatingRow[]));
    if (error || data.length < SHOP_RATINGS_PAGE) break;
  }
  return rows;
}
