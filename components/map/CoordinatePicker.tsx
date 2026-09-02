'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Loaded only via next/dynamic(..., { ssr: false }) from the cafe's
// "Профиль на карте" screen (app/dashboard/cafe/(hub)/map-profile) — same
// reason as CafeMapClient: Leaflet needs `window` at import time.

const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173]; // Moscow

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

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
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
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const icon = useMemo(() => pickerIcon(), []);
  const center: [number, number] = lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={lat !== null ? 14 : 4} className="w-full h-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPlace onPick={onChange} />
      {lat !== null && lng !== null && (
        <Marker
          position={[lat, lng]}
          icon={icon}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as L.Marker;
              const position = marker.getLatLng();
              onChange(position.lat, position.lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
