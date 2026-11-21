'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CafeRatingScore, CafeRatingSummary, CafeReview } from '@/lib/types/cafeRatings';
import { emptyCafeRatingSummary, formatRatingsCount, isGoodPlace, parseCafeRatingInput } from '@/lib/types/cafeRatings';
import { CAFE_RATING_MAX_REVIEW_LENGTH } from '@/lib/types/cafeRatings';
import {
  deleteCafeRating,
  fetchCafeRatingReviews,
  fetchCafeRatingSummary,
  fetchOwnCafeRating,
  rateCafe,
} from '@/lib/data/cafeRatings';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { BeanRating, BeanRatingInput } from '@/components/shared/BeanRating';

// Публичный рейтинг кофейни «зёрнами» в карточке на /map (0052). Читать могут
// все (summary + отзывы с именами — через RPC), оценить может ТОЛЬКО гость
// (role enthusiast): анониму кнопка ведёт на логин, staff свою оценку не
// ставит (RPC бы отклонил — кнопку ему и не показываем). Одна активная
// оценка на гостя: если она есть, вместо формы — её состояние и удаление
// (переоценки нет по правилу владельца).
//
// Смена shopId — новая карточка: всё состояние сбрасывается в эффекте,
// каждая async-запись пропускается, если эффект уже отменён (панель закрыта
// или открыта другая кофейня) — иначе поздний ответ прошлой карточки
// перезаписал бы текущую.

type AuthState = 'loading' | 'anon' | 'enthusiast' | 'staff';

const LOGIN_HREF = `/auth/login?next=${encodeURIComponent('/map')}`;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU');
}

export function CafeRatingSection({ shopId }: { shopId: string }) {
  const [summary, setSummary] = useState<CafeRatingSummary | null>(null);
  const [reviews, setReviews] = useState<CafeReview[] | null>(null);
  const [auth, setAuth] = useState<AuthState>('loading');
  const [own, setOwn] = useState<{ score: CafeRatingScore; review: string | null } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draftScore, setDraftScore] = useState(0);
  const [draftReview, setDraftReview] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // shopId последнего НЕотменённого эффекта. handleSubmit/handleDelete живут
  // между рендерами — после каждого await проверяют, что карточка с их
  // кофейной всё ещё активна: иначе поздний ответ прошлой карточки
  // перезаписал бы состояние уже открытой другой.
  const activeShopRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    activeShopRef.current = shopId;

    // Новая карточка — чистое состояние, ничего от прошлой кофейни.
    setSummary(null);
    setReviews(null);
    setAuth('loading');
    setOwn(null);
    setFormOpen(false);
    setDraftScore(0);
    setDraftReview('');
    setBusy(false);
    setConfirmDelete(false);
    setNotice(null);
    setError(null);

    void (async () => {
      // Публичные данные: summary + отзывы.
      const [nextSummary, nextReviews] = await Promise.all([
        fetchCafeRatingSummary(shopId),
        fetchCafeRatingReviews(shopId),
      ]);
      if (cancelled) return;
      setSummary(nextSummary ?? emptyCafeRatingSummary());
      setReviews(nextReviews);

      // Кто смотрит карточку: аноним / гость (может оценивать) / staff (нет).
      // Сессия — общая cookie (lib/supabase/browserClient), карточка на /map
      // сама по себе вне (site)-layout, поэтому определяем роль напрямую.
      let user;
      try {
        ({ data: { user } } = await getBrowserSupabaseClient().auth.getUser());
      } catch {
        user = null;
      }
      if (cancelled) return;
      if (!user) {
        setAuth('anon');
        return;
      }
      const { data: profile } = await getBrowserSupabaseClient()
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if ((profile as { role: string } | null)?.role !== 'enthusiast') {
        setAuth('staff');
        return;
      }
      // Гость: «enthusiast» открываем ТОЛЬКО после чтения своей оценки —
      // иначе форма доступна до конца чтения, а поздний пустой ответ
      // перезаписал бы состояние после отправки/удаления.
      const ownRating = await fetchOwnCafeRating(shopId);
      if (cancelled) return;
      setOwn(ownRating);
      setAuth('enthusiast');
    })();

    return () => {
      cancelled = true;
      activeShopRef.current = null;
    };
  }, [shopId]);

  async function handleSubmit() {
    const parsed = parseCafeRatingInput(draftScore, draftReview);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await rateCafe(shopId, parsed.score, parsed.review);
    if (activeShopRef.current !== shopId) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFormOpen(false);
    setDraftScore(0);
    setDraftReview('');
    setNotice('Спасибо за оценку!');
    setOwn({ score: parsed.score, review: parsed.review });
    const [nextSummary, nextReviews] = await Promise.all([
      fetchCafeRatingSummary(shopId),
      fetchCafeRatingReviews(shopId),
    ]);
    if (activeShopRef.current !== shopId) return;
    setSummary(nextSummary ?? emptyCafeRatingSummary());
    setReviews(nextReviews);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await deleteCafeRating(shopId);
    if (activeShopRef.current !== shopId) return;
    setBusy(false);
    setConfirmDelete(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOwn(null);
    setNotice('Оценка удалена. Поставить новую можно в любой момент.');
    const [nextSummary, nextReviews] = await Promise.all([
      fetchCafeRatingSummary(shopId),
      fetchCafeRatingReviews(shopId),
    ]);
    if (activeShopRef.current !== shopId) return;
    setSummary(nextSummary ?? emptyCafeRatingSummary());
    setReviews(nextReviews);
  }

  const data = summary ?? emptyCafeRatingSummary();
  const goodPlace = isGoodPlace(data);

  return (
    <section className="mb-4" aria-label="Рейтинг кофейни">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-2">
        {data.count > 0 && data.average !== null ? (
          <>
            <BeanRating value={data.average} />
            <span className="font-body font-medium text-sm text-ink-900">{data.average.toFixed(1).replace('.', ',')}</span>
            <span className="text-xs text-ink-400">· {formatRatingsCount(data.count)}</span>
          </>
        ) : (
          <span className="text-xs text-ink-400">Оценок пока нет — станьте первым</span>
        )}
        {goodPlace && (
          <span
            className="rounded-full border border-gold-400 bg-parchment-200 px-2.5 py-0.5 text-[11px] text-gold-500"
            title="Средняя оценка не ниже 4,5 и минимум 3 оценки"
          >
            Хорошее место — кофейное место
          </span>
        )}
      </div>

      {reviews !== null && reviews.length > 0 && (
        <ul className="flex flex-col gap-3 mb-3">
          {reviews.map((review, index) => (
            <li key={`${review.createdAt}-${index}`} className="rounded-md border border-ink-200 bg-parchment-200/60 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-ink-900 truncate">{review.authorName}</span>
                <span className="text-[11px] text-ink-400 shrink-0">{formatDate(review.createdAt)}</span>
              </div>
              <div className="mb-1">
                <BeanRating value={review.score} size={13} />
              </div>
              {review.review && <p className="text-sm text-ink-700 leading-relaxed">{review.review}</p>}
            </li>
          ))}
        </ul>
      )}

      {auth === 'loading' ? null : auth === 'anon' ? (
        <Link
          href={LOGIN_HREF}
          className="inline-flex items-center justify-center rounded-md border border-ink-900 px-4 py-2
                     text-sm font-medium text-ink-900 hover:bg-ink-900 hover:text-parchment-100 transition-colors"
        >
          Оценить
        </Link>
      ) : auth === 'enthusiast' ? (
        own ? (
          <div className="rounded-md border border-ink-200 bg-parchment-200/60 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-ink-900">Ваша оценка</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 disabled:opacity-50"
              >
                {confirmDelete ? 'Точно удалить?' : 'Удалить оценку'}
              </button>
            </div>
            <BeanRating value={own.score} size={13} />
            {own.review && <p className="text-sm text-ink-700 leading-relaxed mt-1">{own.review}</p>}
            <p className="text-[11px] text-ink-400 mt-2">
              Переоценки нет: чтобы изменить мнение, удалите оценку и поставьте новую.
            </p>
          </div>
        ) : formOpen ? (
          <div className="rounded-md border border-ink-200 bg-parchment-200/60 p-3">
            <p className="section-label mb-2">Ваша оценка</p>
            <div className="mb-3">
              <BeanRatingInput value={draftScore} onChange={setDraftScore} />
            </div>
            <label className="block mb-3">
              <span className="text-xs text-ink-500 mb-1 block">Отзыв (необязательно, публикуется с вашим именем)</span>
              <textarea
                value={draftReview}
                onChange={(event) => setDraftReview(event.target.value)}
                maxLength={CAFE_RATING_MAX_REVIEW_LENGTH}
                rows={3}
                placeholder="Какой кофе попробовали? Как сервис?"
                className="w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm text-ink-900 focus:border-gold-400"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy || draftScore === 0}
                className="inline-flex items-center justify-center rounded-md bg-ink-900 px-4 py-2 text-sm font-medium
                           text-parchment-100 hover:bg-ink-800 transition-colors disabled:opacity-50"
              >
                {busy ? 'Отправка…' : 'Отправить оценку'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setError(null);
                }}
                disabled={busy}
                className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              setNotice(null);
            }}
            className="inline-flex items-center justify-center rounded-md bg-ink-900 px-4 py-2 text-sm font-medium
                       text-parchment-100 hover:bg-ink-800 transition-colors"
          >
            Оценить
          </button>
        )
      ) : null}

      {error && !formOpen && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {notice && !formOpen && <p className="text-xs text-moss-700 mt-2">{notice}</p>}
    </section>
  );
}
