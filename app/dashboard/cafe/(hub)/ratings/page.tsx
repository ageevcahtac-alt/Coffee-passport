'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CafeRatingRow } from '@/lib/types/database';
import { computeCafeRatingSummary, formatBeans, formatRatingsCount } from '@/lib/types/cafeRatings';
import { fetchRatingAuthorNames, fetchShopCafeRatings } from '@/lib/data/cafeRatings';
import { useStaffSession } from '@/lib/auth/staffSession';
import { BeanRating } from '@/components/shared/BeanRating';

// Оценки и отзывы гостей «зёрнами» (0052) — кабинет кофейни. По правилу
// владельца здесь видно ВСЁ: все активные оценки, включая низкие, ничего
// не фильтруется и не скрывается. Гистограмма — распределение по значениям
// 1–5, длина полосы пропорциональна числу таких оценок; средний балл и
// всего оценок — рядом. Удалённые гостями оценки в агрегаты не попадают
// (строки остаются в базе для аудита, но кабинет их не показывает).

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU');
}

export default function CafeRatingsPage() {
  const { cafeId } = useStaffSession();
  const [rows, setRows] = useState<CafeRatingRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;
    fetchShopCafeRatings(cafeId).then(async (found) => {
      if (cancelled) return;
      setRows(found);
      const uniqueIds = Array.from(new Set(found.map((row) => row.user_id).filter((id): id is string => Boolean(id))));
      const resolved = await fetchRatingAuthorNames(uniqueIds);
      if (!cancelled) setNames(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  const summary = useMemo(() => computeCafeRatingSummary(rows ?? []), [rows]);
  // Гистограмма сверху вниз: от 5 зёрен к 1 — как привычнее читать «лучшее
  // сверху». distribution[0] — единички, поэтому индекс разворачивается.
  const histogram = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((score) => ({
        score,
        count: summary.distribution[score - 1],
      })),
    [summary]
  );
  const maxCount = Math.max(1, ...histogram.map((bucket) => bucket.count));

  if (!cafeId) {
    return <p className="text-sm text-ink-500">Аккаунт не привязан к кофейне — оценки недоступны.</p>;
  }

  return (
    <>
      <p className="section-label mb-2">Оценки и отзывы гостей</p>
      <p className="text-xs text-ink-400 mb-8">
        Все оценки этой кофейни, включая низкие, — ничего не скрывается.
      </p>

      {rows === null ? (
        <p className="text-sm text-ink-400 mb-8">Загрузка оценок…</p>
      ) : summary.count === 0 ? (
        <p className="text-sm text-ink-500 mb-8">
          Оценок пока нет. Как только гости оценят кофейню, здесь появятся средний балл,
          распределение и отзывы.
        </p>
      ) : (
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5 mb-8">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="font-display text-3xl text-ink-900 leading-none">
                {summary.average !== null ? summary.average.toFixed(1).replace('.', ',') : '—'}
              </p>
              <p className="text-xs text-ink-400 mt-1">средний балл</p>
            </div>
            <div className="text-right">
              <p className="font-body font-medium text-ink-900">{formatRatingsCount(summary.count)}</p>
              <div className="mt-1">
                <BeanRating value={summary.average ?? 0} size={13} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {histogram.map((bucket) => (
              <div key={bucket.score} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-ink-700 text-right">{formatBeans(bucket.score)}</span>
                <div className="flex-1 h-4 rounded-sm bg-parchment-200 overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-[width]"
                    style={{
                      width: `${(bucket.count / maxCount) * 100}%`,
                      backgroundColor: bucket.count > 0 ? 'var(--color-rating)' : 'transparent',
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-xs text-ink-500">
                  {bucket.count} {bucket.count === 1 ? 'оценка' : bucket.count >= 2 && bucket.count <= 4 ? 'оценки' : 'оценок'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <p className="section-label mb-4">Отзывы ({rows.length})</p>
          <ul className="flex flex-col gap-3 mb-8">
            {rows.map((row) => {
              const rawName = row.user_id ? names.get(row.user_id) : undefined;
              const authorName = rawName && rawName.trim() ? rawName.trim() : 'Гость без имени';
              return (
                <li key={row.id} className="rounded-md border border-ink-200 bg-parchment-100 p-4">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-ink-900 truncate">{authorName}</span>
                    <span className="text-[11px] text-ink-400 shrink-0">{formatDate(row.created_at)}</span>
                  </div>
                  <div className="mb-1.5">
                    <BeanRating value={row.score} size={13} />
                  </div>
                  {row.review ? (
                    <p className="text-sm text-ink-700 leading-relaxed">{row.review}</p>
                  ) : (
                    <p className="text-xs text-ink-400 italic">Оценка без текста</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
