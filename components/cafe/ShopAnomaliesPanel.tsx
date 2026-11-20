'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchCafeBaristaNames,
  fetchGuestCodes,
  fetchGuestDisplayNames,
  fetchShopConsumptionsSince,
} from '@/lib/data/loyalty';
import {
  ANOMALY_CHECK_THRESHOLD_RUBLES,
  ANOMALY_FETCH_LIMIT,
  ANOMALY_PERIOD_DAYS,
  ANOMALY_TALL_CHECKS_LIMIT,
  tallChecks,
  topGuestsByCashback,
  windowConsumptions,
  type AnomalyPeriod,
  type Consumption,
} from '@/lib/types/loyalty';

// «Аномалии» — экран read-only прозрачности кабинета кофейни: бариста вводит
// суммы чеков вручную, запретов мы не вводим — владелец видит подозрительное
// глазами. Источник — тот же журнал loyalty_consumptions, что и у «Журнала
// чеков»; начисления здесь не считаются и не меняются, только выборки:
// топ гостей по кэшбэку и чеки выше порога, переключатель неделя/месяц и
// фильтр по бариста пересчитывают оба блока. Порог — константа из
// lib/types/loyalty.ts (ANOMALY_CHECK_THRESHOLD_RUBLES), в одном месте.
export function ShopAnomaliesPanel({ shopId }: { shopId: string }) {
  // null — ещё грузим; false — загрузка упала (не путать с «чеков нет»).
  const [consumptions, setConsumptions] = useState<Consumption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [baristaNames, setBaristaNames] = useState<Map<string, string>>(new Map());
  const [codes, setCodes] = useState<Map<string, string | null>>(new Map());
  const [period, setPeriod] = useState<AnomalyPeriod>('week');
  const [baristaFilter, setBaristaFilter] = useState<string>('all');

  // Окно максимума (месяц) — одна выборка на монтирование; переключатель
  // неделя/месяц режет уже скачанное, без повторных запросов. Обрезка
  // (truncated) — честная пометка, что за окно чеков больше, чем показано.
  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    fetchShopConsumptionsSince(shopId, ANOMALY_PERIOD_DAYS.month).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(true);
        return;
      }
      setConsumptions(result.rows);
      setTruncated(result.truncated);
      const ids = result.rows.flatMap((row) => [row.guestId, row.baristaId].filter(Boolean) as string[]);
      void fetchGuestDisplayNames(ids).then((found) => {
        if (!cancelled) setNames((prev) => new Map([...prev, ...found]));
      });
      void fetchGuestCodes(ids).then((found) => {
        if (!cancelled) setCodes((prev) => new Map([...prev, ...found]));
      });
    });
    // Имена staff браузером из profiles не читаются (0013 читает энтузиастов) —
    // берём из учёток команды (тот же GET, что и страница «Команда»).
    void fetchCafeBaristaNames().then((found) => {
      if (!cancelled) setBaristaNames(found);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const baristas = useMemo(() => {
    const ids = Array.from(
      new Set((consumptions ?? []).map((c) => c.baristaId).filter((id): id is string => Boolean(id))),
    );
    return ids.sort((a, b) =>
      (baristaNames.get(a) ?? a).localeCompare(baristaNames.get(b) ?? b, 'ru-RU'),
    );
  }, [consumptions, baristaNames]);

  const windowed = useMemo(() => {
    const rows = windowConsumptions(consumptions ?? [], ANOMALY_PERIOD_DAYS[period]);
    return baristaFilter === 'all' ? rows : rows.filter((c) => c.baristaId === baristaFilter);
  }, [consumptions, period, baristaFilter]);

  const topGuests = useMemo(() => topGuestsByCashback(windowed), [windowed]);
  const aboveNorm = useMemo(() => tallChecks(windowed), [windowed]);

  if (loadError) {
    return (
      <p className="text-sm text-rating">
        Не удалось загрузить чеки. Проверьте соединение и обновите страницу — экран ничего не
        показывает, пока данные не прочитаны целиком.
      </p>
    );
  }
  if (consumptions === null) return <p className="text-sm text-ink-400">Загрузка…</p>;

  const shortId = (id: string) => id.slice(0, 8);
  const guestLabel = (id: string) => {
    const name = names.get(id) ?? shortId(id);
    const code = codes.get(id);
    return code ? `${name} · код ${code}` : name;
  };
  const baristaLabel = (id: string | null) =>
    id ? (baristaNames.get(id) ?? names.get(id) ?? 'Бариста') : '—';
  const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;
  const at = (value: string) => new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-md border border-ink-200 p-1 sm:w-64">
          {(Object.keys(ANOMALY_PERIOD_DAYS) as AnomalyPeriod[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`flex-1 rounded-md py-2 text-sm font-body font-medium transition-colors
                          ${period === key ? 'bg-ink-900 text-parchment-100' : 'text-ink-500 hover:text-ink-700'}`}
            >
              {key === 'week' ? 'Неделя' : 'Месяц'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-500">
          Бариста
          <select
            value={baristaFilter}
            onChange={(event) => setBaristaFilter(event.target.value)}
            className="rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm text-ink-900"
          >
            <option value="all">Все</option>
            {baristas.map((id) => (
              <option key={id} value={id}>
                {baristaNames.get(id) ?? shortId(id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {truncated && (
        <p className="text-xs text-rating">
          За месяц больше {ANOMALY_FETCH_LIMIT.toLocaleString('ru-RU')} чеков — показаны последние{' '}
          {ANOMALY_FETCH_LIMIT.toLocaleString('ru-RU')}. Данные за окно неполные: крупный чек мог
          уйти за пределы выборки.
        </p>
      )}

      <section>
        <p className="section-label mb-4">Топ гостей по начисленному кэшбэку</p>
        {topGuests.length === 0 ? (
          <p className="text-sm text-ink-400">За выбранный период чеков не было.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-ink-400 text-xs text-left">
                  <th className="font-normal pb-2 pr-4">Гость</th>
                  <th className="font-normal pb-2 pr-4">Чеков</th>
                  <th className="font-normal pb-2">Кэшбэк начислено</th>
                </tr>
              </thead>
              <tbody>
                {topGuests.map((guest) => (
                  <tr key={guest.guestId} className="border-t border-ink-200">
                    <td className="py-2.5 pr-4 text-ink-900">{guestLabel(guest.guestId)}</td>
                    <td className="py-2.5 pr-4 data-value text-ink-900">{guest.checksCount}</td>
                    <td className="py-2.5 data-value text-moss-700">
                      +{guest.earnedBeans.toLocaleString('ru-RU')} 🫘
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <p className="section-label mb-1">Чеки выше нормы</p>
        <p className="text-xs text-ink-400 mb-4">
          Порог — {rub(ANOMALY_CHECK_THRESHOLD_RUBLES)} за чек (средний чек кофейни ~536 ₽). Запретов не
          вводим: список для вашей сверки глазами, действия с чеками здесь недоступны.
        </p>
        {aboveNorm.length === 0 ? (
          <p className="text-sm text-ink-400">
            Чеков выше {rub(ANOMALY_CHECK_THRESHOLD_RUBLES)} за выбранный период не найдено — всё в пределах нормы.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-ink-400 text-xs text-left">
                    <th className="font-normal pb-2 pr-4">Дата</th>
                    <th className="font-normal pb-2 pr-4">Бариста</th>
                    <th className="font-normal pb-2 pr-4">Гость</th>
                    <th className="font-normal pb-2 pr-4">Чек</th>
                    <th className="font-normal pb-2">Начислено</th>
                  </tr>
                </thead>
                <tbody>
                  {aboveNorm.map((check) => (
                    <tr key={check.id} className="border-t border-ink-200">
                      <td className="py-2.5 pr-4 text-xs text-ink-400">{at(check.createdAt)}</td>
                      <td className="py-2.5 pr-4 text-ink-900">{baristaLabel(check.baristaId)}</td>
                      <td className="py-2.5 pr-4 text-ink-900">{guestLabel(check.guestId)}</td>
                      <td className="py-2.5 pr-4 data-value text-ink-900">{rub(check.grossAmount)}</td>
                      <td className="py-2.5 data-value text-moss-700">
                        {check.beansEarned > 0 ? `+${check.beansEarned}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {aboveNorm.length === ANOMALY_TALL_CHECKS_LIMIT && (
              <p className="text-[11px] text-ink-400 mt-3">
                Показаны {ANOMALY_TALL_CHECKS_LIMIT} самых крупных чеков окна — полный журнал в разделе «Лояльность».
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
