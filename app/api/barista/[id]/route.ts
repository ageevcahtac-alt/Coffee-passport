import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import type { BaristaProfileRow, RecipeRow } from '@/lib/types/database';
import type { Barista, BrewingRecipe } from '@/lib/types/coffee';
import { getBaristaById } from '@/lib/data/baristas';

// Same "not really an admin bypass" client as /api/events — createAdminSupabaseClient
// uses the anon key (no service role configured for this project yet), so
// every read here is still gated by barista_profiles'/recipes' own RLS
// policies (see supabase/migrations/0015_barista_profiles.sql and
// 0005_recipes_equipment_checkins.sql's "public reads published recipes").
export const dynamic = 'force-dynamic';

function rowToRecipe(row: RecipeRow): BrewingRecipe {
  return {
    id: row.id,
    lotId: row.lot_id,
    brewingMethodId: row.brewing_method_id as BrewingRecipe['brewingMethodId'],
    authorType: row.author_type,
    authorId: row.author_id,
    authorName: row.author_name,
    isBenchmark: row.is_benchmark,
    parentRecipeId: row.parent_recipe_id,
    doseG: row.dose_g,
    yieldG: row.yield_g,
    measuredTdsPercent: row.measured_tds_percent,
    grinderModel: row.grinder_model,
    grinderSetting: row.grinder_setting,
    waterTempC: row.water_temp_c,
    waterBrand: row.water_brand,
    waterTds: row.water_tds,
    waterCustomMineralization: row.water_custom_mineralization,
    bloomTimeSec: row.bloom_time_sec,
    preInfusionSec: row.pre_infusion_sec,
    flowRateGPerSec: row.flow_rate_g_per_sec,
    totalTimeSec: row.total_time_sec,
    equipmentModel: row.equipment_model,
    pressureBar: row.pressure_bar,
    pressureProfile: row.pressure_profile,
    notes: row.notes,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

// GET /api/barista/[id] — a barista's profile (personal-preference layer,
// falling back to the static id/name/coffeeShopId roster in
// lib/data/baristas.ts when no barista_profiles row has been saved yet)
// plus every published recipe they authored, across all lots. Used
// wherever the tasting flow or a saved drink card needs to look a barista
// up by id alone (see components/barista/BaristaProfileCard.tsx and
// components/barista/BaristaRecipeDisclosure.tsx for the client-side
// equivalents that read the same data from the local store instead — this
// route exists for server-side/external callers per the product spec,
// the app's own UI reads lib/data/baristaProfileStore.ts directly).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabaseClient();

  const [{ data: profileRow, error: profileError }, { data: recipeRows, error: recipeError }] =
    await Promise.all([
      supabase.from('barista_profiles').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('recipes').select('*').eq('author_type', 'barista').eq('author_id', params.id),
    ]);

  if (profileError) {
    console.error('[api/barista] profile lookup failed', profileError);
    return NextResponse.json({ error: 'Не удалось загрузить профиль бариста.' }, { status: 500 });
  }
  if (recipeError) {
    console.error('[api/barista] recipe lookup failed', recipeError);
    return NextResponse.json({ error: 'Не удалось загрузить рецепты бариста.' }, { status: 500 });
  }

  const seed = getBaristaById(params.id);
  const barista: Barista | null = profileRow
    ? rowToBarista(profileRow, seed)
    : seed ?? null;

  if (!barista) {
    return NextResponse.json({ error: 'Бариста не найден.' }, { status: 404 });
  }

  return NextResponse.json({
    barista,
    recipes: (recipeRows ?? []).map(rowToRecipe),
  });
}

function rowToBarista(row: BaristaProfileRow, seed: Barista | undefined): Barista {
  return {
    id: row.id,
    name: row.name || seed?.name || row.id,
    coffeeShopId: row.coffee_shop_id || seed?.coffeeShopId || '',
    favoriteOrigin: row.favorite_origin,
    favoriteBrewMethod: row.favorite_brew_method as Barista['favoriteBrewMethod'],
    avatarUrl: row.avatar_url,
  };
}
