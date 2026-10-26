export interface GeocodeResult {
  lat: number;
  lng: number;
}

// Browser side of «Найти на карте по адресу»: asks our own route, which asks
// Nominatim from the server (lib/server/geocode.ts — 1 request/second, cache).
// The visitor's browser never contacts nominatim.openstreetmap.org (CLAUDE.md,
// «Данные только в России»).
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const response = await fetch(`/api/cafe/geocode?q=${encodeURIComponent(trimmed)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const { lat, lng } = (await response.json()) as Partial<GeocodeResult>;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: lat as number, lng: lng as number };
  } catch {
    return null;
  }
}
