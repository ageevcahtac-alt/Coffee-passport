export interface GeocodeResult {
  lat: number;
  lng: number;
}

// Nominatim — OpenStreetMap's free geocoding search, no API key needed,
// matching the rest of the map module's Leaflet+OSM stack (no Google/Yandex
// Maps key is configured in this project). Usage policy
// (https://operations.osmfoundation.org/policies/nominatim/) caps this at
// roughly 1 request/second; every caller here is a manual, one-click "Найти
// на карте" action, never triggered on keystroke, which stays comfortably
// inside that limit.
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const results = (await response.json()) as { lat?: string; lon?: string }[];
    const first = results[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
