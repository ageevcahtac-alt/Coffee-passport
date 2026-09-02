'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CoffeeShop } from '@/lib/types/coffee';

// Loaded only via next/dynamic(..., { ssr: false }) from app/(site)/map —
// Leaflet touches `window`/`document` at import time, so it can never be
// part of a server-rendered bundle.

const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173]; // Moscow — a
// reasonable fallback only shown for the instant before FitAllBounds below
// re-centers on the shops that actually have coordinates.
const DEFAULT_ZOOM = 4;

export interface FlyTarget {
  center: [number, number];
  zoom: number;
}

function pinIconFor(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid var(--color-parchment-100, #faf8f5);
      box-shadow:0 1px 4px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -20],
  });
}

// <MapContainer>'s center/zoom props are only read once, on mount — react-
// leaflet does not react to them changing (see its own docs). Re-centering
// after that needs the imperative map instance, which only exists inside
// the map's own React tree, hence this child component reading useMap().
function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target.center, target.zoom, { duration: 0.75 });
  }, [target, map]);
  return null;
}

// Fits every visible pin into view exactly once, right after the shop list
// first resolves — not on every re-render, or it would fight the city
// filter's own FlyTo the moment a guest picks a city.
function FitAllBounds({ shops }: { shops: CoffeeShop[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || shops.length === 0) return;
    fitted.current = true;
    const bounds = L.latLngBounds(
      shops.map((shop) => [shop.lat as number, shop.lng as number] as [number, number])
    );
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
  }, [shops, map]);
  return null;
}

export function CafeMapClient({
  shops,
  flyTarget,
  onSelectShop,
}: {
  shops: CoffeeShop[]; // pre-filtered to shops with lat/lng both set
  flyTarget: FlyTarget | null;
  onSelectShop: (shop: CoffeeShop) => void;
}) {
  const icons = useMemo(
    () => new Map(shops.map((shop) => [shop.id, pinIconFor(shop.brandColor)])),
    [shops]
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="w-full h-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitAllBounds shops={shops} />
      <FlyTo target={flyTarget} />
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false}>
        {shops.map((shop) => (
          <Marker
            key={shop.id}
            position={[shop.lat as number, shop.lng as number]}
            icon={icons.get(shop.id)}
            eventHandlers={{ click: () => onSelectShop(shop) }}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
