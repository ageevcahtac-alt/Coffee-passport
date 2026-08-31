'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useJourney } from '@/lib/journey/useJourney';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds } from '@/lib/data/useCafeMenu';
import { getBaristasForShop } from '@/lib/data/baristas';
import { useStaffSession } from '@/lib/auth/staffSession';
import { CoffeeReviewCard } from '@/components/cafe/CoffeeReviewCard';
import { ServiceReviewCard } from '@/components/cafe/ServiceReviewCard';

type Tab = 'coffee' | 'service';

const PAGE_SIZE = 10;

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm ' +
  'text-ink-900 focus:border-gold-400';

// The full, paginated + filterable review archive behind "Посмотреть все
// отзывы..." on the dashboard home (components/cafe/GuestFeedback.tsx,
// which only ever shows a 1-2 item preview) — this is the page that scales
// once a shop has hundreds of reviews instead of a handful.
export default function CafeAnalyticsPage() {
  const { cafeId } = useStaffSession();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'service' ? 'service' : 'coffee');
  const [baristaFilter, setBaristaFilter] = useState('all');
  const [lotFilter, setLotFilter] = useState(searchParams.get('lotId') ?? 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const records = useJourney();
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(cafeId ?? '');
  const menuLots = useMemo(
    () => lots.filter((lot) => menuLotIds.includes(lot.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [lots, menuLotIds]
  );
  const shopBaristas = useMemo(() => getBaristasForShop(cafeId ?? ''), [cafeId]);

  const shopRecords = useMemo(
    () => records.filter((record) => record.coffeeShopId === cafeId),
    [records, cafeId]
  );

  const scoped = tab === 'coffee' ? shopRecords : shopRecords.filter((record) => record.baristaRating > 0);

  const filtered = useMemo(() => {
    return scoped
      .filter((record) => baristaFilter === 'all' || record.baristaId === baristaFilter)
      .filter((record) => lotFilter === 'all' || record.lotId === lotFilter)
      .filter((record) => !dateFrom || new Date(record.createdAt) >= new Date(dateFrom))
      .filter((record) => !dateTo || new Date(record.createdAt) <= new Date(`${dateTo}T23:59:59`))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scoped is derived fresh every render from tab/shopRecords, safe to depend on its inputs instead
  }, [shopRecords, tab, baristaFilter, lotFilter, dateFrom, dateTo]);

  // Any filter/tab change invalidates the current page — always land back
  // on page 1 rather than showing a page that might now be out of range.
  useEffect(() => {
    setPage(1);
  }, [tab, baristaFilter, lotFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function resetFilters() {
    setBaristaFilter('all');
    setLotFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div>
      <p className="section-label mb-2">Аналитика и отзывы</p>
      <h1 className="font-display text-2xl text-ink-900 mb-8">Архив отзывов гостей</h1>

      <div role="tablist" aria-label="Категория отзывов" className="flex gap-1.5 mb-6">
        <TabButton active={tab === 'coffee'} onClick={() => setTab('coffee')} label="☕ Кофе и экстракция" />
        <TabButton active={tab === 'service'} onClick={() => setTab('service')} label="👤 Сервис и внешний вид" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 rounded-md border border-ink-200 bg-parchment-100 p-4">
        <div>
          <label htmlFor="filter-barista" className="block text-xs text-ink-400 mb-1.5">
            Бариста
          </label>
          <select
            id="filter-barista"
            value={baristaFilter}
            onChange={(event) => setBaristaFilter(event.target.value)}
            className={fieldClasses}
          >
            <option value="all">Все</option>
            {shopBaristas.map((barista) => (
              <option key={barista.id} value={barista.id}>
                {barista.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-lot" className="block text-xs text-ink-400 mb-1.5">
            Лот
          </label>
          <select
            id="filter-lot"
            value={lotFilter}
            onChange={(event) => setLotFilter(event.target.value)}
            className={fieldClasses}
          >
            <option value="all">Все</option>
            {menuLots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-from" className="block text-xs text-ink-400 mb-1.5">
              С даты
            </label>
            <input
              id="filter-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="block text-xs text-ink-400 mb-1.5">
              По дату
            </label>
            <input
              id="filter-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className={fieldClasses}
            />
          </div>
        </div>
        {(baristaFilter !== 'all' || lotFilter !== 'all' || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={resetFilters}
            className="sm:col-span-3 text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 self-start"
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      <p className="text-xs text-ink-400 mb-4">
        Найдено {filtered.length} {pluralizeReviews(filtered.length)}
      </p>

      {pageItems.length === 0 ? (
        <p className="text-sm text-ink-400">Ничего не найдено по этим фильтрам.</p>
      ) : (
        <div className="flex flex-col gap-4 rounded-md border border-ink-200 bg-parchment-100 p-5">
          {pageItems.map((record) =>
            tab === 'coffee' ? (
              <CoffeeReviewCard key={record.id} record={record} allRecords={records} shopId={cafeId ?? ''} />
            ) : (
              <ServiceReviewCard key={record.id} record={record} />
            )
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900
                       disabled:opacity-30 disabled:pointer-events-none"
          >
            ← Назад
          </button>
          <span className="data-value text-xs text-ink-400">
            Стр. {currentPage} из {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900
                       disabled:opacity-30 disabled:pointer-events-none"
          >
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors
                  ${active ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium' : 'border-ink-200 text-ink-500'}`}
    >
      {label}
    </button>
  );
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'отзыва';
  return 'отзывов';
}
