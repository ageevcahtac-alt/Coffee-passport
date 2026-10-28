import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { SEED_COFFEE_SHOPS } from '@/lib/data/coffeeShopSeed';
import {
  COFFEE_SHOP_COLUMNS,
  DEFAULT_PIN_COLOR,
  coffeeShopProfileToRow,
  parseMapProfile,
  rowToCoffeeShop,
} from '@/lib/data/partnerRows';
import type { CoffeeShopOrgRow } from '@/lib/types/database';

// "Профиль на карте" (app/dashboard/cafe/(hub)/map-profile) — the cafe's own
// pin, address, contacts, photos. The row is always the session's
// profiles.cafe_id (lib/auth/requireStaffApi.ts), never an id from the body;
// colour and status stay the admin's (app/api/admin/partners).
export async function PUT(request: Request) {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth.response;
  const cafeId = auth.profile.cafeId;
  if (!cafeId) {
    return NextResponse.json({ error: 'Аккаунт не привязан к кофейне.', code: 'forbidden' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 });
  }
  const parsed = parseMapProfile(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const profile = { ...coffeeShopProfileToRow(parsed.value), updated_at: new Date().toISOString() };

  const supabase = createAdminSupabaseClient();
  const { data: existing } = await supabase.from('coffee_shops').select('slug').eq('slug', cafeId).maybeSingle();
  const seed = SEED_COFFEE_SHOPS.find((shop) => shop.id === cafeId);
  const write = existing
    ? supabase.from('coffee_shops').update(profile).eq('slug', cafeId).select(COFFEE_SHOP_COLUMNS).single()
    : supabase
        .from('coffee_shops')
        .insert({ ...profile, slug: cafeId, status: 'active', brand_color: seed?.brandColor ?? DEFAULT_PIN_COLOR })
        .select(COFFEE_SHOP_COLUMNS)
        .single();
  const { data, error } = await write;
  if (error || !data) {
    console.error('[cafe/map-profile] save failed', error);
    return NextResponse.json({ error: 'Не удалось сохранить профиль.' }, { status: 500 });
  }
  return NextResponse.json({ shop: rowToCoffeeShop(data as unknown as CoffeeShopOrgRow, seed) });
}
