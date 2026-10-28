import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { requireAdminApi } from '@/lib/auth/requireAdminApi';
import { SEED_COFFEE_SHOPS } from '@/lib/data/coffeeShopSeed';
import { SEED_ROASTERS } from '@/lib/data/roasterSeed';
import {
  COFFEE_SHOP_COLUMNS,
  DEFAULT_PHILOSOPHY,
  ROASTER_COLUMNS,
  coffeeShopToRow,
  generatePartnerSlug,
  parseActivation,
  roasterToRow,
  rowToCoffeeShop,
  rowToRoaster,
  type Activation,
} from '@/lib/data/partnerRows';
import type { CoffeeShopOrgRow, RoasterOrgRow } from '@/lib/types/database';

// Role admin (lib/auth/requireAdminApi.ts). Partner cards live in
// coffee_shops / roasters (0036_partner_directory.sql); writes go through
// service_role here, never from the browser.

const seedShop = (id: string) => SEED_COFFEE_SHOPS.find((shop) => shop.id === id);
const seedRoaster = (id: string) => SEED_ROASTERS.find((roaster) => roaster.id === id);

// GET — every partner row in the database (any status), as app cards.
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const supabase = createAdminSupabaseClient();
  const [shops, roasters] = await Promise.all([
    supabase.from('coffee_shops').select(COFFEE_SHOP_COLUMNS),
    supabase.from('roasters').select(ROASTER_COLUMNS),
  ]);
  if (shops.error || roasters.error) {
    console.error('[admin/partners] list failed', shops.error ?? roasters.error);
    return NextResponse.json({ error: 'Не удалось загрузить партнёров.' }, { status: 500 });
  }
  return NextResponse.json({
    coffeeShops: (shops.data as unknown as CoffeeShopOrgRow[]).map((row) => rowToCoffeeShop(row, seedShop(row.slug))),
    roasters: (roasters.data as unknown as RoasterOrgRow[]).map((row) => rowToRoaster(row, seedRoaster(row.slug))),
  });
}

function rowFor(input: Activation, slug: string) {
  if (input.kind === 'roaster') {
    const seed = seedRoaster(slug);
    return roasterToRow({
      id: slug,
      name: input.name,
      slug: seed?.slug ?? slug.replace(/^roaster-/, ''),
      color: input.color,
      philosophy: input.philosophy || seed?.philosophy || DEFAULT_PHILOSOPHY,
      city: input.city,
      country: input.country,
      status: 'active',
    });
  }
  const seed = seedShop(slug);
  // No point from the form → keep the built-in card's pin (XO Coffee).
  const coords = input.lat !== null ? { lat: input.lat, lng: input.lng } : { lat: seed?.lat ?? null, lng: seed?.lng ?? null };
  return coffeeShopToRow({
    id: slug,
    name: input.name,
    city: input.city,
    brandColor: input.color,
    ...coords,
    address: seed?.address ?? '',
    phone: seed?.phone ?? '',
    website: seed?.website ?? '',
    instagramUrl: seed?.instagramUrl ?? '',
    telegramUrl: seed?.telegramUrl ?? '',
    vkUrl: seed?.vkUrl ?? '',
    description: seed?.description ?? '',
    workingHours: seed?.workingHours ?? '',
    photos: seed?.photos ?? [],
    status: 'active',
  });
}

// POST — "Активировать партнёра": creates the card (or fills a built-in /
// backfilled one chosen by bindId, e.g. 'shop-xo-vsevolozhsk' so the cafe
// cabinet keeps its profiles.cafe_id) and marks the lead activated.
export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 });
  }
  const parsed = parseActivation(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const seeds = input.kind === 'roaster' ? SEED_ROASTERS : SEED_COFFEE_SHOPS;
  if (input.bindId && !seeds.some((seed) => seed.id === input.bindId)) {
    return NextResponse.json({ error: 'Такой карточки нет.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const table = input.kind === 'roaster' ? 'roasters' : 'coffee_shops';

  if (input.requestId) {
    for (const linkedTable of ['coffee_shops', 'roasters'] as const) {
      const { data: linked } = await supabase
        .from(linkedTable)
        .select('slug')
        .eq('partner_request_id', input.requestId)
        .maybeSingle();
      if (linked) return NextResponse.json({ error: 'Эта заявка уже активирована.' }, { status: 409 });
    }
  }

  const { data: existing, error: listError } = await supabase.from(table).select('slug, partner_request_id');
  if (listError) {
    console.error('[admin/partners] list failed', listError);
    return NextResponse.json({ error: 'Не удалось активировать партнёра.' }, { status: 500 });
  }
  const rows = (existing ?? []) as { slug: string; partner_request_id: string | null }[];
  const bound = input.bindId ? rows.find((row) => row.slug === input.bindId) : undefined;
  if (bound?.partner_request_id) {
    return NextResponse.json({ error: 'Эта карточка уже привязана к другой заявке.' }, { status: 409 });
  }
  const slug =
    input.bindId ??
    generatePartnerSlug(input.kind, input.name, new Set([...rows.map((row) => row.slug), ...seeds.map((seed) => seed.id)]));
  const row = { ...rowFor(input, slug), partner_request_id: input.requestId, updated_at: new Date().toISOString() };

  // A bound card can already exist as a thin anchor (0022 lot backfill,
  // e.g. 'roaster-xo') — fill it instead of inserting a duplicate slug.
  const write = bound
    ? supabase.from(table).update(row).eq('slug', slug).select(table === 'roasters' ? ROASTER_COLUMNS : COFFEE_SHOP_COLUMNS).single()
    : supabase.from(table).insert(row).select(table === 'roasters' ? ROASTER_COLUMNS : COFFEE_SHOP_COLUMNS).single();
  const { data, error } = await write;
  if (error || !data) {
    console.error('[admin/partners] activation failed', error);
    const conflict = error?.code === '23505';
    return NextResponse.json(
      { error: conflict ? 'Такая карточка уже есть.' : 'Не удалось активировать партнёра.' },
      { status: conflict ? 409 : 500 }
    );
  }

  if (input.requestId) {
    const { error: requestError } = await supabase
      .from('partner_requests')
      .update({ status: 'activated', updated_at: new Date().toISOString() })
      .eq('id', input.requestId)
      .select('id')
      .single();
    if (requestError) console.error('[admin/partners] request status not updated', requestError);
  }

  const partner =
    input.kind === 'roaster'
      ? rowToRoaster(data as unknown as RoasterOrgRow, seedRoaster(slug))
      : rowToCoffeeShop(data as unknown as CoffeeShopOrgRow, seedShop(slug));
  return NextResponse.json({ kind: input.kind, partner }, { status: 201 });
}
