import Link from 'next/link';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getRoasterById } from '@/lib/data/roasters';
import type { Lot, TastingRecord } from '@/lib/types/coffee';

// The "business card" shown when a guest clicks a trophy badge — scoped to
// one coffee shop across the guest's WHOLE journey (not just the clicked
// country), since "регионов открыто" and the lot list are shop-wide
// totals. Distinct from clicking the pin on the map itself, which opens
// just that pin's latest lot for that one country.
export function CoffeeShopProfileCard({
  coffeeShopId,
  records,
}: {
  coffeeShopId: string;
  records: TastingRecord[];
}) {
  const shop = getCoffeeShopById(coffeeShopId);
  if (!shop) return null;

  const shopRecords = records.filter((record) => record.coffeeShopId === coffeeShopId);
  const lotIds = Array.from(new Set(shopRecords.map((record) => record.lotId)));
  const lots = lotIds
    .map((id) => getMergedLotById(id))
    .filter((lot): lot is Lot => Boolean(lot))
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  const regionsCount = new Set(lots.map((lot) => lot.country)).size;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: shop.brandColor }}
          aria-hidden="true"
        />
        <h3 className="font-display text-lg text-ink-900 leading-tight">{shop.name}</h3>
      </div>
      <p className="text-sm text-ink-400 mb-5">{shop.city}</p>

      <dl className="grid gap-2.5 text-sm mb-5">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Регионов открыто</dt>
          <dd className="data-value text-gold-500 text-right">{regionsCount}</dd>
        </div>
      </dl>

      <p className="section-label mb-3">Продегустированные лоты</p>
      <ul className="flex flex-col gap-1.5">
        {lots.map((lot) => {
          const roaster = getRoasterById(lot.roasterId);
          return (
            <li key={lot.id}>
              <Link
                href={`/passport/${lot.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 -mx-2.5
                           text-sm text-ink-700 hover:bg-parchment-200 hover:text-ink-900
                           transition-colors"
              >
                <span>{lot.name}</span>
                <span className="data-value text-xs text-ink-400 shrink-0">
                  {roaster?.name ?? lot.country}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
