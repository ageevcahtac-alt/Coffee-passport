import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import type { ActivatedPin } from './CoffeeBeltMap';

// The pin dropped on the map is mirrored down here permanently — grouped by
// region (medallion), with a shop-colored, shop-labeled badge underneath
// for every coffee shop the guest has checked in from for that region.
// Clicking a badge opens the full shop profile (see CoffeeShopProfileCard),
// distinct from clicking the pin on the map itself, which opens just that
// pin's latest lot.
export function TrophyShelf({
  pins,
  selectedShopId,
  onSelectShop,
}: {
  pins: ActivatedPin[];
  selectedShopId: string | null;
  onSelectShop: (coffeeShopId: string) => void;
}) {
  const byCountry = new Map<string, ActivatedPin[]>();
  for (const pin of pins) {
    const group = byCountry.get(pin.country) ?? [];
    group.push(pin);
    byCountry.set(pin.country, group);
  }
  const sortedCountries = Array.from(byCountry.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <p className="section-label mb-4">Трофейная витрина</p>
      {pins.length === 0 ? (
        <p className="text-xs text-ink-400">
          Здесь появятся булавки открытых регионов — по одной за каждую кофейню, где вы
          дегустировали лот из этой страны.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedCountries.map(([country, group]) => (
            <div key={country}>
              <p className="text-xs font-medium text-ink-900 mb-2">{country}</p>
              <div className="flex flex-wrap gap-2">
                {group.map((pin) => {
                  const shop = getCoffeeShopById(pin.coffeeShopId);
                  const selected = selectedShopId === pin.coffeeShopId;
                  const color = shop?.brandColor ?? 'var(--color-gold-500)';
                  return (
                    <button
                      key={`${pin.country}::${pin.coffeeShopId}`}
                      type="button"
                      onClick={() => onSelectShop(pin.coffeeShopId)}
                      aria-pressed={selected}
                      className={pin.justActivated ? 'reveal-pop' : undefined}
                    >
                      <span
                        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs
                                   text-ink-900 transition-colors"
                        style={{
                          borderColor: color,
                          backgroundColor: selected ? `${color}26` : 'var(--color-parchment-100)',
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        {shop?.name ?? pin.coffeeShopId}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
