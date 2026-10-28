import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { requireAdminApi } from '@/lib/auth/requireAdminApi';
import { isPartnerKind, parsePartnerPatch } from '@/lib/data/partnerRows';

// Role admin — "Реестр партнёров": name, city, pin colour, status (and the
// roaster's country / philosophy) of one database row, by its slug.
export async function PATCH(request: Request, { params }: { params: { kind: string; id: string } }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  if (!isPartnerKind(params.kind)) return NextResponse.json({ error: 'Не найдено.' }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 });
  }
  const parsed = parsePartnerPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, city, country, philosophy, color, status } = parsed.value;

  const update: Record<string, string> = {};
  if (name !== undefined) update.name = name;
  if (city !== undefined) update.city = city;
  if (status !== undefined) update.status = status;
  if (params.kind === 'roaster') {
    if (color !== undefined) update.color = color;
    if (country !== undefined) update.country = country;
    if (philosophy !== undefined) update.philosophy = philosophy;
  } else if (color !== undefined) {
    update.brand_color = color;
  }
  update.updated_at = new Date().toISOString();

  const supabase = createAdminSupabaseClient();
  const table = params.kind === 'roaster' ? 'roasters' : 'coffee_shops';
  const { data: existing } = await supabase.from(table).select('slug').eq('slug', params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Партнёра нет в базе.' }, { status: 404 });

  const { error } = await supabase.from(table).update(update).eq('slug', params.id).select('slug').single();
  if (error) {
    console.error('[admin/partners] update failed', error);
    return NextResponse.json({ error: 'Не удалось сохранить.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
