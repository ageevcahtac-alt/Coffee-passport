// Server-side address search for the cafe cabinet's «Найти на карте по адресу»
// (app/api/cafe/geocode). Nominatim is asked only from our server, so the
// visitor's IP never reaches nominatim.openstreetmap.org (CLAUDE.md, «Данные
// только в России»). Usage policy
// (https://operations.osmfoundation.org/policies/nominatim/): an identifying
// User-Agent, at most 1 request/second for the whole application, cached
// results. The app runs as a single Node process (systemd unit
// coffee-passport), so module-level state is the whole application's state.

export interface GeocodeResult {
  lat: number;
  lng: number;
}

export type GeocodeOutcome =
  | { status: 'ok'; result: GeocodeResult }
  | { status: 'not_found' }
  | { status: 'busy' }
  | { status: 'error' };

export const NOMINATIM_USER_AGENT = 'CoffeePassport/1.0 (+https://coffeepassport.ru)';

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1000;
const TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface GeocoderOptions {
  fetchImpl?: typeof fetch;
  // Requests waiting for their 1-second slot; beyond this the caller gets
  // "busy" instead of an ever-growing queue.
  maxQueue?: number;
}

const normalize = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

// fetchImpl defaults to the global fetch looked up per call, not captured at
// import time (so a test's stub is honoured and never reaches the real service).
export function createGeocoder({ fetchImpl = (...args) => fetch(...args), maxQueue = 10 }: GeocoderOptions = {}) {
  const cache = new Map<string, { at: number; outcome: GeocodeOutcome }>();
  const inFlight = new Map<string, Promise<GeocodeOutcome>>();
  let queued = 0;
  let lastStart = -Infinity;
  let slot: Promise<unknown> = Promise.resolve();

  async function ask(query: string): Promise<GeocodeOutcome> {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStart = Date.now();
    try {
      const url = `${SEARCH_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': NOMINATIM_USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return { status: 'error' };
      const results = (await response.json()) as { lat?: string; lon?: string }[];
      const first = results[0];
      if (!first?.lat || !first?.lon) return { status: 'not_found' };
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'not_found' };
      return { status: 'ok', result: { lat, lng } };
    } catch {
      return { status: 'error' };
    }
  }

  return async function geocode(raw: string): Promise<GeocodeOutcome> {
    const query = raw.trim().replace(/\s+/g, ' ');
    const key = normalize(query);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.outcome;
    const pending = inFlight.get(key);
    if (pending) return pending;
    if (queued >= maxQueue) return { status: 'busy' };

    queued += 1;
    const run = slot.then(() => ask(query));
    slot = run;
    const done = run.then((outcome) => {
      if (outcome.status === 'ok' || outcome.status === 'not_found') {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(key, { at: Date.now(), outcome });
      }
      return outcome;
    });
    inFlight.set(key, done);
    try {
      return await done;
    } finally {
      queued -= 1;
      inFlight.delete(key);
    }
  };
}

export const geocodeOnServer = createGeocoder();
