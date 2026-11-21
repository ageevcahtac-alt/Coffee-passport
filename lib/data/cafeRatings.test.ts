import { beforeEach, describe, expect, it, vi } from 'vitest';

// Клиентский слой рейтинга (lib/data/cafeRatings.ts): пишет только через
// RPC (правила — в телах функций 0052), читает summary/отзывы публично и
// свою строку через RLS. Мокаем браузерный клиент минимальным двойником.

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({ rpc: rpcMock, from: fromMock }),
}));

import {
  deleteCafeRating,
  fetchCafeRatingReviews,
  fetchCafeRatingSummary,
  fetchOwnCafeRating,
  fetchRatingAuthorNames,
  fetchShopCafeRatings,
  rateCafe,
} from './cafeRatings';

function tableChain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.maybeSingle = async () => result;
  // thenable-финал для fetchShopCafeRatings (await builder)
  return builder;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('rateCafe / deleteCafeRating', () => {
  it('returns ok on a successful rpc result', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(rateCafe('shop-x', 4, 'текст')).resolves.toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('cafe_rate', { p_cafe_id: 'shop-x', p_score: 4, p_review: 'текст' });
  });

  it('surfaces the server error message (second active rating, wrong role, …)', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, error: 'Вы уже оценили эту кофейню.' }, error: null });
    await expect(rateCafe('shop-x', 5, null)).resolves.toEqual({ ok: false, error: 'Вы уже оценили эту кофейню.' });
  });

  it('maps a transport error to a generic message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(rateCafe('shop-x', 5, null)).resolves.toEqual({ ok: false, error: 'Не удалось сохранить оценку. Попробуйте ещё раз.' });
  });

  it('falls back when the payload shape is unexpected', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(deleteCafeRating('shop-x')).resolves.toEqual({ ok: false, error: 'Не удалось удалить оценку.' });
  });
});

describe('fetchCafeRatingSummary', () => {
  it('maps the rpc payload and normalizes the average to 0.1', async () => {
    rpcMock.mockResolvedValue({ data: { average: 4.66666, count: 7, distribution: [1, 0, 1, 2, 3] }, error: null });
    await expect(fetchCafeRatingSummary('shop-x')).resolves.toEqual({
      average: 4.7,
      count: 7,
      distribution: [1, 0, 1, 2, 3],
    });
  });

  it('returns a zero summary shape for a cafe without ratings', async () => {
    rpcMock.mockResolvedValue({ data: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] }, error: null });
    await expect(fetchCafeRatingSummary('shop-x')).resolves.toEqual({
      average: null,
      count: 0,
      distribution: [0, 0, 0, 0, 0],
    });
  });

  it('returns null on a failed read', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchCafeRatingSummary('shop-x')).resolves.toBeNull();
  });

  it('pads a malformed distribution to five buckets', async () => {
    rpcMock.mockResolvedValue({ data: { average: 5, count: 1, distribution: [0] }, error: null });
    await expect(fetchCafeRatingSummary('shop-x')).resolves.toEqual({ average: 5, count: 1, distribution: [0, 0, 0, 0, 0] });
  });
});

describe('fetchCafeRatingReviews', () => {
  it('maps rows and truncates fractional scores', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { score: 5, review: 'Класс', author_name: 'Аня', created_at: '2026-11-20T10:00:00Z' },
        { score: 4.9, review: null, author_name: '', created_at: '2026-11-19T10:00:00Z' },
      ],
      error: null,
    });
    const reviews = await fetchCafeRatingReviews('shop-x');
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toEqual({ score: 5, review: 'Класс', authorName: 'Аня', createdAt: '2026-11-20T10:00:00Z' });
    expect(reviews[1].score).toBe(4);
  });

  it('returns an empty list on failure', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchCafeRatingReviews('shop-x')).resolves.toEqual([]);
  });
});

describe('fetchOwnCafeRating', () => {
  it('returns the own active rating', async () => {
    fromMock.mockReturnValue(tableChain({ data: { score: 3, review: 'норм' }, error: null }));
    await expect(fetchOwnCafeRating('shop-x')).resolves.toEqual({ score: 3, review: 'норм' });
  });

  it('returns null when anon (RLS error) or not rated yet', async () => {
    fromMock.mockReturnValue(tableChain({ data: null, error: { message: 'permission denied' } }));
    await expect(fetchOwnCafeRating('shop-x')).resolves.toBeNull();
    fromMock.mockReturnValue(tableChain({ data: null, error: null }));
    await expect(fetchOwnCafeRating('shop-x')).resolves.toBeNull();
  });
});

describe('fetchRatingAuthorNames', () => {
  it('returns display_name as-is, null when unset — no id-slice fallback', async () => {
    let seenIn: unknown = null;
    const thenable = {
      select: () => thenable,
      in: (_column: string, values: unknown) => {
        seenIn = values;
        return thenable;
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [{ id: 'u1', display_name: 'Вера' }, { id: 'u2', display_name: null }], error: null }),
    };
    fromMock.mockReturnValue(thenable);
    const names = await fetchRatingAuthorNames(['u1', 'u2', 'u2', '']);
    expect(names.get('u1')).toBe('Вера');
    expect(names.get('u2')).toBeNull(); // кабинет покажет «Гость без имени», не срез id
    expect(seenIn).toEqual(['u1', 'u2']); // дедуп и отсев пустых
  });

  it('returns an empty map for empty input without touching the client', async () => {
    fromMock.mockReset();
    await expect(fetchRatingAuthorNames([])).resolves.toEqual(new Map());
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('fetchShopCafeRatings', () => {
  it('passes the cafe filter through and returns rows', async () => {
    const rows = [{ id: 'r1', cafe_id: 'shop-x', user_id: 'u1', score: 5, review: null, created_at: 'x', deleted_at: null }];
    // await builder — thenable с финальным результатом (одна страница < 1000)
    const thenable = {
      select: () => thenable,
      eq: () => thenable,
      order: () => thenable,
      range: () => thenable,
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    };
    fromMock.mockReturnValue(thenable);
    await expect(fetchShopCafeRatings('shop-x')).resolves.toEqual(rows);
  });

  it('pages until a short page and flattens the result', async () => {
    const makeRows = (tag: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, cafe_id: 'shop-x', user_id: 'u1', score: 5, review: null, created_at: 'x', deleted_at: null }));
    const pages = [makeRows('a', 1000), makeRows('b', 3)];
    let page = 0;
    const thenable = {
      select: () => thenable,
      eq: () => thenable,
      order: () => thenable,
      range: () => thenable,
      then: (resolve: (value: unknown) => void) => resolve({ data: pages[page++] ?? [], error: null }),
    };
    fromMock.mockReturnValue(thenable);
    const rows = await fetchShopCafeRatings('shop-x');
    expect(rows).toHaveLength(1003);
    expect(page).toBe(2);
  });

  it('returns what was read when a later page fails', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `a-${i}`, cafe_id: 'shop-x', user_id: 'u1', score: 5, review: null, created_at: 'x', deleted_at: null }));
    let calls = 0;
    const thenable = {
      select: () => thenable,
      eq: () => thenable,
      order: () => thenable,
      range: () => thenable,
      then: (resolve: (value: unknown) => void) => {
        calls += 1;
        resolve(calls === 1 ? { data: fullPage, error: null } : { data: null, error: { message: 'boom' } });
      },
    };
    fromMock.mockReturnValue(thenable);
    await expect(fetchShopCafeRatings('shop-x')).resolves.toEqual(fullPage);
  });
});
