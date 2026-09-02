'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L, { type LeafletEventHandlerFnMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CoffeeShop } from '@/lib/types/coffee';

// Loaded only via next/dynamic(..., { ssr: false }) from app/map — Leaflet
// touches `window`/`document` at import time, so it can never be part of a
// server-rendered bundle.

const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173]; // Moscow — a
// reasonable fallback only shown for the instant before FitAllBounds below
// re-centers on the shops that actually have coordinates.
const DEFAULT_ZOOM = 4;
const FALLBACK_PIN_COLOR = '#8a7a63';

// CartoDB Voyager — a clean, neutral basemap (no OSM's default watermark
// styling) served free with no API key, same "no map key configured in
// this project" constraint as the rest of this module.
const CARTO_VOYAGER_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export interface FlyTarget {
  center: [number, number];
  zoom: number;
}

function pinIconFor(color: string | undefined): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;border-radius:50% 50% 50% 0;
      background:${color || FALLBACK_PIN_COLOR};transform:rotate(-45deg);
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
  shops: CoffeeShop[]; // pre-filtered to shops with lat/lng both set and numeric
  flyTarget: FlyTarget | null;
  onSelectShop: (shop: CoffeeShop) => void;
}) {
  const icons = useMemo(
    () => new Map(shops.map((shop) => [shop.id, pinIconFor(shop.brandColor)])),
    [shops]
  );

  // One stable handlers object per shop, keyed by id and recomputed only
  // when the shop list itself changes — not a fresh `{ click: ... }`
  // literal on every render. react-leaflet's eventHandlers prop is compared
  // by reference: a new literal every render makes it unbind and rebind the
  // marker's click listener on every re-render (including the one the click
  // itself triggers), which is wasted churn at best and, combined with
  // leaflet.markercluster's own DOM housekeeping on click, a real crash
  // vector at worst.
  const handlersById = useMemo(() => {
    const map = new Map<string, LeafletEventHandlerFnMap>();
    for (const shop of shops) {
      map.set(shop.id, { click: () => onSelectShop(shop) });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelectShop is the page's setState, stable across renders
  }, [shops]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="w-full h-full"
      scrollWheelZoom
      // Leaflet's own default attribution control renders a "Leaflet" flag
      // link nobody asked for on top of the tile credit — off entirely
      // rather than fighting its prefix API, per this screen's clean-chrome
      // requirement.
      attributionControl={false}
    >
      <TileLayer
        attribution="&copy; Map data &copy; OpenStreetMap contributors"
        url={CARTO_VOYAGER_URL}
        subdomains="abcd"
        detectRetina
      />
      <FitAllBounds shops={shops} />
      <FlyTo target={flyTarget} />
      {/* animate:false sidesteps a known leaflet.markercluster + React
          instability where the library's own spiderfy/zoom DOM animation
          can race a React re-render and try to touch a node React has
          already reconciled away. */}
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false} animate={false}>
        {shops.map((shop) => (
          <Marker
            key={shop.id}
            position={[shop.lat as number, shop.lng as number]}
            icon={icons.get(shop.id)}
            eventHandlers={handlersById.get(shop.id)}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
