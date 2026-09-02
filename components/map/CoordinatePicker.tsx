'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Loaded only via next/dynamic(..., { ssr: false }) from the cafe's
// "Профиль на карте" screen (app/dashboard/cafe/(hub)/map-profile) — same
// reason as CafeMapClient: Leaflet needs `window` at import time.

const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173]; // Moscow

// Same stock OpenStreetMap raster tiles as CafeMapClient (the public /map
// screen) — CartoDB's free basemaps now watermark "API KEY REQUIRED"
// without one, and this project has no map API key configured for
// anything.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function pickerIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      background:var(--color-gold-500, #c9a24a);transform:rotate(-45deg);
      border:2px solid var(--color-parchment-100, #faf8f5);
      box-shadow:0 1px 4px rgba(0,0,0,.4);
    "></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

// `onPick` comes from the parent form as a fresh inline closure every
// render — reading it through a ref keeps the handler this component
// registers with Leaflet referentially stable, so react-leaflet doesn't
// unbind/rebind the map's click listener on every keystroke elsewhere in
// the form (same reasoning as CafeMapClient's memoized eventHandlers).
function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  useMapEvents({
    click(event) {
      onPickRef.current(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

// Recenters the map whenever `signal` changes (any new value, regardless of
// direction) — driven by the "Найти на карте по адресу" geocode action, not
// by every lat/lng change, since a click-to-place update already moves the
// visible marker under the cursor and doesn't need an extra camera move.
function RecenterOnSignal({
  lat,
  lng,
  signal,
}: {
  lat: number | null;
  lng: number | null;
  signal: number;
}) {
  const map = useMap();
  const lastSignal = useRef(signal);
  useEffect(() => {
    if (signal !== lastSignal.current && lat !== null && lng !== null) {
      lastSignal.current = signal;
      map.flyTo([lat, lng], 15, { duration: 0.75 });
    }
  }, [signal, lat, lng, map]);
  return null;
}

// A single-marker map for setting a coffee shop's own coordinates — click
// anywhere to drop/move the pin, or drag it directly. Deliberately its own
// small component rather than CafeMapClient in a "single pin" mode: it
// needs no clustering and a different center-on-mount rule (this shop's own
// point, not "fit every shop's pins").
export function CoordinatePicker({
  lat,
  lng,
  onChange,
  recenterSignal = 0,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  recenterSignal?: number;
}) {
  const icon = useMemo(() => pickerIcon(), []);
  const center: [number, number] = lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dragHandlers = useMemo(
    () => ({
      dragend: (event: L.DragEndEvent) => {
        const marker = event.target as L.Marker;
        const position = marker.getLatLng();
        onChangeRef.current(position.lat, position.lng);
      },
    }),
    []
  );

  return (
    <MapContainer
      center={center}
      zoom={lat !== null ? 14 : 4}
      className="w-full h-full"
      scrollWheelZoom
      attributionControl={false}
    >
      <TileLayer
        attribution="&copy; Map data &copy; OpenStreetMap contributors"
        url={TILE_URL}
      />
      <ClickToPlace onPick={onChange} />
      <RecenterOnSignal lat={lat} lng={lng} signal={recenterSignal} />
      {lat !== null && lng !== null && (
        <Marker position={[lat, lng]} icon={icon} draggable eventHandlers={dragHandlers} />
      )}
    </MapContainer>
  );
}
