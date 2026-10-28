import type { CoffeeShop, Roaster } from '@/lib/types/coffee';
import type {
  CoffeeShopOrgInsert,
  CoffeeShopOrgRow,
  PartnerStatus,
  RoasterOrgInsert,
  RoasterOrgRow,
} from '@/lib/types/database';

// coffee_shops / roasters rows (0036_partner_directory.sql) <-> the app's
// CoffeeShop / Roaster cards, plus validation of everything the admin and
// cafe screens send. Plain module (no 'use client') — shared by the client
// stores (coffeeShops.ts, roasters.ts) and the server routes
// (app/api/admin/partners/**, app/api/cafe/map-profile).
//
// The row's slug is the app id ('shop-xo-vsevolozhsk', 'roaster-xo') — the
// same text profiles.cafe_id / roaster_id already hold. A null column means
// "not set in the database": the built-in card with that id fills it, then
// a default.

export type PartnerKind = 'coffee_shop' | 'roaster';
export const PARTNER_STATUSES: PartnerStatus[] = ['active', 'paused'];
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  active: 'Активен',
  paused: 'Приостановлен',
};
export const DEFAULT_PIN_COLOR = '#D4AF37';
export const DEFAULT_PHILOSOPHY = 'Партнёр платформы Coffee Passport.';

export const COFFEE_SHOP_COLUMNS =
  'slug, name, status, brand_color, city, lat, lng, address, phone, website, instagram_url, ' +
  'telegram_url, vk_url, description, working_hours, photos, partner_request_id';
export const ROASTER_COLUMNS = 'slug, name, status, color, city, country, philosophy, partner_request_id';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PARTNER_ID = /^[a-z0-9а-яё-]{1,80}$/i;
const REQUEST_ID = /^[0-9a-z-]{1,64}$/i;
const MAX_TEXT = 500;
const MAX_PHOTOS = 3;
const MAX_PHOTO_LENGTH = 4_000_000; // compressed data: URL, see lib/utils/imageFile.ts

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function isPartnerKind(value: unknown): value is PartnerKind {
  return value === 'coffee_shop' || value === 'roaster';
}

function isStatus(value: unknown): value is PartnerStatus {
  return PARTNER_STATUSES.includes(value as PartnerStatus);
}

function text(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// A pin needs both coordinates or neither (Leaflet's [lat, lng] tuple).
function point(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } {
  const a = finite(lat);
  const b = finite(lng);
  return a !== null && b !== null ? { lat: a, lng: b } : { lat: null, lng: null };
}

type ShopRowInput = Pick<CoffeeShopOrgRow, 'slug' | 'name'> & Partial<CoffeeShopOrgRow>;
type RoasterRowInput = Pick<RoasterOrgRow, 'slug' | 'name'> & Partial<RoasterOrgRow>;

export function rowToCoffeeShop(row: ShopRowInput, seed?: CoffeeShop): CoffeeShop {
  const hasPoint = finite(row.lat) !== null || finite(row.lng) !== null;
  const coords = hasPoint ? point(row.lat, row.lng) : point(seed?.lat, seed?.lng);
  return {
    id: row.slug,
    name: row.name,
    city: text(row.city, seed?.city ?? ''),
    brandColor: isHexColor(row.brand_color) ? row.brand_color : seed?.brandColor ?? DEFAULT_PIN_COLOR,
    ...coords,
    address: text(row.address, seed?.address ?? ''),
    phone: text(row.phone, seed?.phone ?? ''),
    website: text(row.website, seed?.website ?? ''),
    instagramUrl: text(row.instagram_url, seed?.instagramUrl ?? ''),
    telegramUrl: text(row.telegram_url, seed?.telegramUrl ?? ''),
    vkUrl: text(row.vk_url, seed?.vkUrl ?? ''),
    description: text(row.description, seed?.description ?? ''),
    workingHours: text(row.working_hours, seed?.workingHours ?? ''),
    photos: Array.isArray(row.photos) ? row.photos.filter((url) => typeof url === 'string' && url) : seed?.photos ?? [],
    status: isStatus(row.status) ? row.status : 'active',
  };
}

export function rowToRoaster(row: RoasterRowInput, seed?: Roaster): Roaster {
  return {
    id: row.slug,
    name: row.name,
    slug: seed?.slug ?? row.slug.replace(/^roaster-/, ''),
    color: isHexColor(row.color) ? row.color : seed?.color ?? DEFAULT_PIN_COLOR,
    philosophy: text(row.philosophy, seed?.philosophy ?? DEFAULT_PHILOSOPHY),
    city: text(row.city, seed?.city ?? ''),
    country: text(row.country, seed?.country ?? 'Россия'),
    status: isStatus(row.status) ? row.status : 'active',
  };
}

export function coffeeShopProfileToRow(shop: Omit<CoffeeShop, 'id' | 'brandColor' | 'status'>) {
  return {
    name: shop.name,
    city: shop.city,
    lat: shop.lat,
    lng: shop.lng,
    address: shop.address,
    phone: shop.phone,
    website: shop.website,
    instagram_url: shop.instagramUrl,
    telegram_url: shop.telegramUrl,
    vk_url: shop.vkUrl,
    description: shop.description,
    working_hours: shop.workingHours,
    photos: shop.photos,
  };
}

export function coffeeShopToRow(shop: CoffeeShop): CoffeeShopOrgInsert {
  return { slug: shop.id, ...coffeeShopProfileToRow(shop), brand_color: shop.brandColor, status: shop.status };
}

export function roasterToRow(roaster: Roaster): RoasterOrgInsert {
  return {
    slug: roaster.id,
    name: roaster.name,
    color: roaster.color,
    philosophy: roaster.philosophy,
    city: roaster.city,
    country: roaster.country,
    status: roaster.status,
  };
}

// Built-in cards first, in their order; a database row with the same id
// replaces its card in place; database-only rows follow.
export function mergePartners<T extends { id: string }>(seed: T[], db: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of seed) merged.set(item.id, item);
  for (const item of db) merged.set(item.id, item);
  return Array.from(merged.values());
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9а-яё]+/g, '');
}

// "Xocoffee" from the lead form is the built-in "XO Coffee" card.
export function sameCompanyName(a: string, b: string): boolean {
  const left = normalizeName(a);
  return left.length > 0 && left === normalizeName(b);
}

export function generatePartnerSlug(kind: PartnerKind, name: string, taken: Set<string>): string {
  const prefix = kind === 'roaster' ? 'roaster' : 'shop';
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const base = `${prefix}-${slug || 'partner'}`;
  let id = base;
  for (let sequence = 2; taken.has(id); sequence += 1) id = `${base}-${sequence}`;
  return id;
}

function requiredText(value: unknown, label: string): Result<string> {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return { ok: false, error: `Укажите ${label}.` };
  if (trimmed.length > 120) return { ok: false, error: `Слишком длинное поле: ${label}.` };
  return { ok: true, value: trimmed };
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' && value.length <= MAX_TEXT ? value.trim() : null;
}

function parsePoint(lat: unknown, lng: unknown): Result<{ lat: number | null; lng: number | null }> {
  const empty = (value: unknown) => value === undefined || value === null;
  if (empty(lat) && empty(lng)) return { ok: true, value: { lat: null, lng: null } };
  const a = finite(lat);
  const b = finite(lng);
  if (a === null || b === null || Math.abs(a) > 90 || Math.abs(b) > 180) {
    return { ok: false, error: 'Точка на карте задана неверно.' };
  }
  return { ok: true, value: { lat: a, lng: b } };
}

export interface Activation {
  kind: PartnerKind;
  name: string;
  city: string;
  country: string;
  philosophy: string;
  color: string;
  lat: number | null;
  lng: number | null;
  bindId: string | null;
  requestId: string | null;
}

export function parseActivation(body: unknown): Result<Activation> {
  const input = (body ?? {}) as Record<string, unknown>;
  if (!isPartnerKind(input.kind)) return { ok: false, error: 'Неизвестный тип партнёра.' };
  const name = requiredText(input.name, 'название');
  if (!name.ok) return name;
  const city = requiredText(input.city, 'город');
  if (!city.ok) return city;
  if (!isHexColor(input.color)) return { ok: false, error: 'Цвет должен быть в формате #RRGGBB.' };
  const coords = parsePoint(input.lat, input.lng);
  if (!coords.ok) return coords;
  const country = optionalText(input.country);
  const philosophy = optionalText(input.philosophy);
  if (country === null || philosophy === null) return { ok: false, error: 'Слишком длинный текст.' };
  const bindId = input.bindId ?? null;
  if (bindId !== null && (typeof bindId !== 'string' || !PARTNER_ID.test(bindId))) {
    return { ok: false, error: 'Неверная карточка для привязки.' };
  }
  const requestId = input.requestId ?? null;
  if (requestId !== null && (typeof requestId !== 'string' || !REQUEST_ID.test(requestId))) {
    return { ok: false, error: 'Неверная заявка.' };
  }
  return {
    ok: true,
    value: {
      kind: input.kind,
      name: name.value,
      city: city.value,
      country: country || 'Россия',
      philosophy,
      color: input.color.toLowerCase(),
      ...coords.value,
      bindId,
      requestId,
    },
  };
}

export interface PartnerPatch {
  name?: string;
  city?: string;
  country?: string;
  philosophy?: string;
  color?: string;
  status?: PartnerStatus;
}

export function parsePartnerPatch(body: unknown): Result<PartnerPatch> {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: PartnerPatch = {};
  if (input.name !== undefined) {
    const name = requiredText(input.name, 'название');
    if (!name.ok) return name;
    patch.name = name.value;
  }
  for (const key of ['city', 'country', 'philosophy'] as const) {
    if (input[key] === undefined) continue;
    const value = optionalText(input[key]);
    if (value === null) return { ok: false, error: 'Слишком длинный текст.' };
    patch[key] = value;
  }
  if (input.color !== undefined) {
    if (!isHexColor(input.color)) return { ok: false, error: 'Цвет должен быть в формате #RRGGBB.' };
    patch.color = input.color.toLowerCase();
  }
  if (input.status !== undefined) {
    if (!isStatus(input.status)) return { ok: false, error: 'Неизвестный статус.' };
    patch.status = input.status;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Нечего сохранять.' };
  return { ok: true, value: patch };
}

function isPhoto(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PHOTO_LENGTH &&
    (value.startsWith('data:image/') || value.startsWith('https://'))
  );
}

export type MapProfile = Omit<CoffeeShop, 'id' | 'brandColor' | 'status'>;

// "Профиль на карте" from the cafe cabinet — everything except id, colour
// and status, which stay the admin's call.
export function parseMapProfile(body: unknown): Result<MapProfile> {
  const input = (body ?? {}) as Record<string, unknown>;
  const name = requiredText(input.name, 'название');
  if (!name.ok) return name;
  const coords = parsePoint(input.lat, input.lng);
  if (!coords.ok) return coords;
  const photos = input.photos ?? [];
  if (!Array.isArray(photos) || photos.length > MAX_PHOTOS || !photos.every(isPhoto)) {
    return { ok: false, error: 'Фото должны быть изображениями, не больше трёх.' };
  }
  const fields = ['city', 'address', 'phone', 'website', 'instagramUrl', 'telegramUrl', 'vkUrl', 'description', 'workingHours'] as const;
  const values = {} as Record<(typeof fields)[number], string>;
  for (const key of fields) {
    const value = optionalText(input[key]);
    if (value === null) return { ok: false, error: 'Слишком длинный текст.' };
    values[key] = value;
  }
  return { ok: true, value: { name: name.value, ...values, ...coords.value, photos } };
}

// A card saved in a browser's localStorage by the old admin screens —
// checked before it goes into the database (/api/admin/partners/import).
export function parseLocalCoffeeShop(raw: unknown): CoffeeShop | null {
  const input = (raw ?? {}) as Record<string, unknown>;
  if (typeof input.id !== 'string' || !PARTNER_ID.test(input.id)) return null;
  if (!isHexColor(input.brandColor)) return null;
  const profile = parseMapProfile({ ...input, photos: Array.isArray(input.photos) ? input.photos.filter(isPhoto) : [] });
  if (!profile.ok) return null;
  return { id: input.id, brandColor: input.brandColor, status: 'active', ...profile.value };
}

export function parseLocalRoaster(raw: unknown): Roaster | null {
  const input = (raw ?? {}) as Record<string, unknown>;
  if (typeof input.id !== 'string' || !PARTNER_ID.test(input.id)) return null;
  if (!isHexColor(input.color)) return null;
  const name = requiredText(input.name, 'название');
  if (!name.ok) return null;
  const rest = ['slug', 'philosophy', 'city', 'country'].map((key) => optionalText(input[key]));
  if (rest.some((value) => value === null)) return null;
  const [slug, philosophy, city, country] = rest as string[];
  return {
    id: input.id,
    name: name.value,
    slug: slug || input.id.replace(/^roaster-/, ''),
    color: input.color,
    philosophy: philosophy || DEFAULT_PHILOSOPHY,
    city,
    country: country || 'Россия',
    status: 'active',
  };
}
