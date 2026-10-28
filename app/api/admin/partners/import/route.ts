import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { requireAdminApi } from '@/lib/auth/requireAdminApi';
import {
  coffeeShopToRow,
  parseLocalCoffeeShop,
  parseLocalRoaster,
  roasterToRow,
} from '@/lib/data/partnerRows';

const MAX_ITEMS = 200;

type Skipped = { id: string; reason: 'exists' | 'invalid' };

// Role admin — "Перенести в базу": partner cards the old admin screens kept
// in this browser's localStorage. Inserts only cards missing from the
// database; an existing row is never overwritten (reported as skipped).
export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  let body: { coffeeShops?: unknown; roasters?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 });
  }
  const rawShops = Array.isArray(body.coffeeShops) ? body.coffeeShops : [];
  const rawRoasters = Array.isArray(body.roasters) ? body.roasters : [];
  if (rawShops.length + rawRoasters.length > MAX_ITEMS) {
    return NextResponse.json({ error: 'Слишком много карточек за раз.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const created: string[] = [];
  const skipped: Skipped[] = [];

  async function insertMissing<T extends { id: string }>(
    table: 'coffee_shops' | 'roasters',
    raw: unknown[],
    parse: (item: unknown) => T | null,
    toRow: (card: T) => { slug: string }
  ): Promise<boolean> {
    if (raw.length === 0) return true;
    const { data: existing, error: listError } = await supabase.from(table).select('slug');
    if (listError) {
      console.error('[admin/partners/import] list failed', listError);
      return false;
    }
    const taken = new Set(((existing ?? []) as { slug: string }[]).map((row) => row.slug));
    const rows: { slug: string }[] = [];
    for (const item of raw) {
      const card = parse(item);
      if (!card) {
        const id = (item as { id?: unknown } | null)?.id;
        skipped.push({ id: typeof id === 'string' ? id : '', reason: 'invalid' });
      } else if (taken.has(card.id)) {
        skipped.push({ id: card.id, reason: 'exists' });
      } else {
        taken.add(card.id);
        rows.push(toRow(card));
      }
    }
    if (rows.length === 0) return true;
    const { error } = await supabase.from(table).insert(rows as never);
    if (error) {
      console.error('[admin/partners/import] insert failed', error);
      return false;
    }
    created.push(...rows.map((row) => row.slug));
    return true;
  }

  const ok =
    (await insertMissing('coffee_shops', rawShops, parseLocalCoffeeShop, coffeeShopToRow)) &&
    (await insertMissing('roasters', rawRoasters, parseLocalRoaster, roasterToRow));
  if (!ok) return NextResponse.json({ error: 'Не удалось перенести.', created, skipped }, { status: 500 });

  return NextResponse.json({ created, skipped });
}
