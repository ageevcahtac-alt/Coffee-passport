import { describe, expect, it } from 'vitest';
import { SEED_COFFEE_SHOPS } from './coffeeShopSeed';
import {
  generatePartnerSlug,
  mergePartners,
  parseActivation,
  parsePartnerPatch,
  rowToCoffeeShop,
  rowToRoaster,
  sameCompanyName,
} from './partnerRows';
import type { CoffeeShopOrgRow, RoasterOrgRow } from '@/lib/types/database';

const XO = SEED_COFFEE_SHOPS.find((shop) => shop.id === 'shop-xo-vsevolozhsk')!;

function shopRow(patch: Partial<CoffeeShopOrgRow> = {}): CoffeeShopOrgRow {
  return {
    id: 'uuid-1', slug: 'shop-new', name: 'Новая', created_at: '', updated_at: '', status: 'active',
    brand_color: null, city: null, lat: null, lng: null, address: null, phone: null, website: null,
    instagram_url: null, telegram_url: null, vk_url: null, description: null, working_hours: null,
    photos: null, partner_request_id: null, ...patch,
  };
}

function roasterRow(patch: Partial<RoasterOrgRow> = {}): RoasterOrgRow {
  return {
    id: 'uuid-r', slug: 'roaster-xo', name: 'XO', created_at: '', updated_at: '', status: 'active',
    color: null, city: null, country: null, philosophy: null, partner_request_id: null, ...patch,
  };
}

describe('rowToCoffeeShop', () => {
  it('uses the row slug as the app id and fills empty columns from the built-in card', () => {
    const shop = rowToCoffeeShop(shopRow({ slug: XO.id, name: 'XO Coffee', brand_color: '#123456' }), XO);
    expect(shop).toMatchObject({ id: XO.id, brandColor: '#123456', lat: XO.lat, lng: XO.lng, address: XO.address, status: 'active' });
  });

  it('falls back to defaults without a built-in card, and drops a half-set point', () => {
    const shop = rowToCoffeeShop(shopRow({ lat: 55.7, lng: null, status: 'paused' }));
    expect(shop).toMatchObject({ id: 'shop-new', lat: null, lng: null, address: '', photos: [], status: 'paused' });
    expect(shop.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('never passes a non-#RRGGBB colour on to the pin HTML', () => {
    const shop = rowToCoffeeShop(shopRow({ brand_color: 'red;background:url(x)' }));
    expect(shop.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('rowToRoaster', () => {
  it('keeps the built-in card for a thin anchor row created by the lot backfill', () => {
    const roaster = rowToRoaster(roasterRow(), {
      id: 'roaster-xo', name: 'XO COFFEE Roasting', slug: 'xo-coffee', color: '#D4AF37',
      philosophy: 'P', city: 'Всеволожск', country: 'Россия', status: 'active',
    });
    expect(roaster).toMatchObject({ id: 'roaster-xo', slug: 'xo-coffee', city: 'Всеволожск', philosophy: 'P', color: '#D4AF37' });
  });
});

describe('generatePartnerSlug / mergePartners / sameCompanyName', () => {
  it('builds a free slug with the kind prefix', () => {
    expect(generatePartnerSlug('coffee_shop', 'Кофе Тест', new Set())).toBe('shop-кофе-тест');
    expect(generatePartnerSlug('roaster', 'Sun', new Set(['roaster-sun']))).toBe('roaster-sun-2');
  });

  it('lets a database row replace the built-in card with the same id and appends new ones', () => {
    const merged = mergePartners([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 2 }]);
    expect(merged).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 2 }]);
  });

  it('matches "Xocoffee" to the built-in XO Coffee card', () => {
    expect(sameCompanyName('Xocoffee', 'XO Coffee')).toBe(true);
    expect(sameCompanyName('Sunrise', 'XO Coffee')).toBe(false);
  });
});

describe('parseActivation / parsePartnerPatch', () => {
  const ok = { kind: 'coffee_shop', name: ' Тест ', city: 'Казань', color: '#AB12CD', lat: 55.79, lng: 49.12 };

  it('accepts a coffee shop with a point and trims text', () => {
    const result = parseActivation(ok);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ kind: 'coffee_shop', name: 'Тест', color: '#ab12cd', lat: 55.79, lng: 49.12 }) });
  });

  for (const [label, patch] of [
    ['bad colour', { color: 'red' }],
    ['empty name', { name: '  ' }],
    ['unknown kind', { kind: 'bar' }],
    ['latitude out of range', { lat: 120 }],
    ['half a point', { lng: null }],
    ['bad bind id', { bindId: 'shop x' }],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(parseActivation({ ...ok, ...patch }).ok).toBe(false);
    });
  }

  it('patch accepts only known statuses and colours', () => {
    expect(parsePartnerPatch({ status: 'paused', color: '#000000' })).toEqual({ ok: true, value: { status: 'paused', color: '#000000' } });
    expect(parsePartnerPatch({ status: 'deleted' }).ok).toBe(false);
    expect(parsePartnerPatch({ color: 'url(x)' }).ok).toBe(false);
    expect(parsePartnerPatch({}).ok).toBe(false);
  });
});
