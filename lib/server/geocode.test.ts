import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeocoder, NOMINATIM_USER_AGENT } from './geocode';

// Server-side Nominatim client: the visitor's browser never talks to
// nominatim.openstreetmap.org (CLAUDE.md, «Данные только в России»), and the
// usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// asks for an identifying User-Agent, at most 1 request/second and caching.

const found = (lat: string, lon: string) =>
  new Response(JSON.stringify([{ lat, lon }]), { status: 200, headers: { 'content-type': 'application/json' } });
const empty = () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });

describe('createGeocoder', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks Nominatim with an identifying User-Agent and returns coordinates', async () => {
    fetchMock.mockResolvedValueOnce(found('59.9311', '30.3609'));
    const geocode = createGeocoder({ fetchImpl: fetchMock });

    await expect(geocode('  Невский проспект 1, Санкт-Петербург ')).resolves.toEqual({
      status: 'ok',
      result: { lat: 59.9311, lng: 30.3609 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://nominatim.openstreetmap.org');
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('q')).toBe('Невский проспект 1, Санкт-Петербург');
    expect(parsed.searchParams.get('limit')).toBe('1');
    expect(init.headers['User-Agent']).toBe(NOMINATIM_USER_AGENT);
    expect(NOMINATIM_USER_AGENT).toContain('https://coffeepassport.ru');
  });

  it('serves a repeated query (any case/spacing) from cache without a second request', async () => {
    fetchMock.mockResolvedValueOnce(found('59.9', '30.3'));
    const geocode = createGeocoder({ fetchImpl: fetchMock });

    await geocode('Невский 1');
    await expect(geocode('  невский   1 ')).resolves.toEqual({ status: 'ok', result: { lat: 59.9, lng: 30.3 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches "not found" too, but not upstream errors', async () => {
    fetchMock.mockResolvedValueOnce(empty()).mockResolvedValueOnce(new Response('busy', { status: 503 }));
    const geocode = createGeocoder({ fetchImpl: fetchMock });

    await expect(geocode('нет такого')).resolves.toEqual({ status: 'not_found' });
    await expect(geocode('нет такого')).resolves.toEqual({ status: 'not_found' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const pending = geocode('сбой');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ status: 'error' });
    fetchMock.mockResolvedValueOnce(found('1', '2'));
    const retry = geocode('сбой');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(retry).resolves.toEqual({ status: 'ok', result: { lat: 1, lng: 2 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps at least one second between requests to Nominatim', async () => {
    const startedAt: number[] = [];
    fetchMock.mockImplementation(async () => {
      startedAt.push(Date.now());
      return found('1', '1');
    });
    const geocode = createGeocoder({ fetchImpl: fetchMock });

    const all = Promise.all([geocode('a'), geocode('b'), geocode('c')]);
    await vi.advanceTimersByTimeAsync(5000);
    await all;

    expect(startedAt).toHaveLength(3);
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(1000);
    expect(startedAt[2] - startedAt[1]).toBeGreaterThanOrEqual(1000);
  });

  it('answers "busy" instead of queueing without bound', async () => {
    fetchMock.mockImplementation(async () => found('1', '1'));
    const geocode = createGeocoder({ fetchImpl: fetchMock, maxQueue: 2 });

    const first = geocode('a');
    const second = geocode('b');
    await expect(geocode('c')).resolves.toEqual({ status: 'busy' });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('treats a network failure or a timeout as an error, not a crash', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const geocode = createGeocoder({ fetchImpl: fetchMock });
    await expect(geocode('a')).resolves.toEqual({ status: 'error' });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
