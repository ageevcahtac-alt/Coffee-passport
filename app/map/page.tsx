'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { CafeDetailPanel } from '@/components/map/CafeDetailPanel';
import type { FlyTarget } from '@/components/map/CafeMapClient';
import type { CoffeeShop } from '@/lib/types/coffee';

// Leaflet reads `window`/`document` as soon as its module evaluates, so the
// actual map can only ever load on the client — ssr:false keeps it (and its
// CSS) out of the server bundle entirely.
const CafeMapClient = dynamic(
  () => import('@/components/map/CafeMapClient').then((mod) => mod.CafeMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-ink-400 text-sm">
        Загрузка карты…
      </div>
    ),
  }
);

const CITY_ZOOM = 13;

// A standalone, isolated screen — deliberately NOT nested under app/(site)
// so it renders full-viewport without the shared Navbar/feedback-widget
// chrome eating into the map area, per the task's "изолированная страница
// /map" requirement. Every "Карта кофеен" entry point elsewhere in the app
// (Navbar, roaster/cafe dashboards) is a plain link here, not an embed.
export default function MapPage() {
  const shops = useCoffeeShops();
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedShop, setSelectedShop] = useState<CoffeeShop | null>(null);

  // Pins can only ever be placed for a shop that has set its own
  // coordinates via "Профиль на карте" (see
  // app/dashboard/cafe/(hub)/map-profile) — a shop without lat/lng yet
  // still counts toward its city's total below, it just has nothing to
  // plot or fly to.
  const geocodedShops = useMemo(() => shops.filter((shop) => shop.lat !== null && shop.lng !== null), [shops]);

  // Every city with at least one coffee shop, counted and sorted — built
  // fresh from the live shop list every render, so a newly activated
  // partner's city appears with no extra wiring.
  const cityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shop of shops) counts.set(shop.city, (counts.get(shop.city) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [shops]);

  const flyTarget: FlyTarget | null = useMemo(() => {
    if (selectedCity === 'all') return null;
    const cityShops = geocodedShops.filter((shop) => shop.city === selectedCity);
    if (cityShops.length === 0) return null;
    const avgLat = cityShops.reduce((sum, shop) => sum + (shop.lat as number), 0) / cityShops.length;
    const avgLng = cityShops.reduce((sum, shop) => sum + (shop.lng as number), 0) / cityShops.length;
    return { center: [avgLat, avgLng], zoom: CITY_ZOOM };
  }, [selectedCity, geocodedShops]);

  return (
    <div className="fixed inset-0 flex flex-col bg-parchment-100">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-ink-200 bg-parchment-100 z-[1000]">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="text-xs uppercase tracking-widest2 text-ink-400 font-body shrink-0">
            ← Coffee Passport
          </Link>
          <h1 className="font-display text-lg text-ink-900 truncate">Карта кофеен-партнёров</h1>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-400 shrink-0">
          Город
          <select
            value={selectedCity}
            onChange={(event) => setSelectedCity(event.target.value)}
            className="rounded-md border border-ink-200 bg-parchment-200 px-3 py-2 text-sm text-ink-900"
          >
            <option value="all">Все города ({shops.length})</option>
            {cityCounts.map(([city, count]) => (
              <option key={city} value={city}>
                {city} [{count}]
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex-1 relative">
        <CafeMapClient shops={geocodedShops} flyTarget={flyTarget} onSelectShop={setSelectedShop} />
      </div>

      {selectedShop && <CafeDetailPanel shop={selectedShop} onClose={() => setSelectedShop(null)} />}
    </div>
  );
}
