import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress } from './geocode';

// The browser helper only ever talks to our own route — the visitor's IP never
// reaches nominatim.openstreetmap.org (CLAUDE.md, «Данные только в России»).

describe('geocodeAddress (browser)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks /api/cafe/geocode on our own origin and returns its coordinates', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ lat: 59.9, lng: 30.3 }), { status: 200 }));
    await expect(geocodeAddress(' Невский 1, Санкт-Петербург ')).resolves.toEqual({ lat: 59.9, lng: 30.3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/cafe/geocode?q=${encodeURIComponent('Невский 1, Санкт-Петербург')}`);
  });

  it('returns null for not found, errors and an empty query', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"code":"not_found"}', { status: 404 }));
    await expect(geocodeAddress('нет такого')).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(geocodeAddress('сбой')).resolves.toBeNull();
    await expect(geocodeAddress('   ')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
