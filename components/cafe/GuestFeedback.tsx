'use client';

import Link from 'next/link';
import { useJourney } from '@/lib/journey/useJourney';
import { CoffeeReviewCard } from '@/components/cafe/CoffeeReviewCard';
import { ServiceReviewCard } from '@/components/cafe/ServiceReviewCard';

// Just a live preview — the newest one or two reviews per category, not
// the whole history (that's app/dashboard/cafe/(hub)/analytics/page.tsx,
// linked below, with pagination + filtering by barista/lot/date). Keeping
// this scoped is what keeps the dashboard home readable once a shop has
// hundreds of reviews instead of a handful.
const PREVIEW_LIMIT = 2;

// Guest feedback splits into two audiences from one shared record: coffee
// impressions (rating, liked/disliked, notes) that the roaster also cares
// about, and staff impressions (barista rating/note) that stay shop-only.
// Both read the same TastingRecord — see lib/types/coffee.ts — just slice
// different fields.
export function GuestFeedback({ shopId }: { shopId: string }) {
  const records = useJourney();
  const shopRecords = [...records]
    .filter((record) => record.coffeeShopId === shopId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const coffeeFeed = shopRecords.slice(0, PREVIEW_LIMIT);
  const staffFeed = shopRecords.filter((record) => record.baristaRating > 0).slice(0, PREVIEW_LIMIT);

  return (
    <section className="mb-12">
      <p className="section-label mb-4">Свежие отзывы гостей</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-body font-medium text-sm text-ink-900">☕ Кофе и экстракция</h3>
          </div>
          <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-4">
            Видит кофейня и обжарщик
          </p>
          {coffeeFeed.length === 0 ? (
            <p className="text-sm text-ink-400 mb-4">Пока нет отзывов о кофе.</p>
          ) : (
            <div className="flex flex-col gap-4 mb-4">
              {coffeeFeed.map((record) => (
                <CoffeeReviewCard key={record.id} record={record} allRecords={records} shopId={shopId} />
              ))}
            </div>
          )}
          <Link
            href="/dashboard/cafe/analytics?tab=coffee"
            className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Посмотреть все отзывы о кофе →
          </Link>
        </div>

        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-body font-medium text-sm text-ink-900">👤 Сервис и внешний вид</h3>
          </div>
          <p className="text-[11px] uppercase tracking-widest2 text-gold-500 mb-4">
            Видно только бариста и кофейне — обжарщику недоступно
          </p>
          {staffFeed.length === 0 ? (
            <p className="text-sm text-ink-400 mb-4">Пока нет отзывов о сервисе.</p>
          ) : (
            <div className="flex flex-col gap-4 mb-4">
              {staffFeed.map((record) => (
                <ServiceReviewCard key={record.id} record={record} />
              ))}
            </div>
          )}
          <Link
            href="/dashboard/cafe/analytics?tab=service"
            className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Посмотреть все отзывы о сервисе →
          </Link>
        </div>
      </div>
    </section>
  );
}
