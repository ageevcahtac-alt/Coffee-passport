import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { isCronRequestAuthorized } from '@/lib/events/cronAuth';
import { isEventLinkAlive } from '@/lib/events/linkCheck';

// Daily archive pass: any event whose end_date is in the past flips from
// 'active' to 'archived' — it drops off the public board (/api/events'
// own filter) but the row stays in the table for the admin's "Архив" tab
// and history. Intended to be hit once a day by an external scheduler —
// see .github/workflows/events-cron.yml for the one wired up in this repo.
//
// Пакет №4: заодно перепроверяем ссылки у активных событий из АВТО-источников
// (source != 'manual' — кураторская лента и ICS-ленты; ручные админские
// записи не трогаем). Битая ссылка обнуляется: мёртвых ссылок на витрине
// нет, у события остаётся карточка без ссылки до правки админом.
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc('events_archive_expired');

  if (error) {
    console.error('[cron/events-archive] failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: activeAuto, error: activeError } = await supabase
    .from('events')
    .select('id, link')
    .eq('status', 'active')
    .gte('end_date', today)
    .neq('source', 'manual')
    .neq('link', '');

  let deadLinksBlanked = 0;
  if (activeError) {
    console.error('[cron/events-archive] link re-check read failed', activeError);
  } else {
    for (const row of activeAuto ?? []) {
      if (await isEventLinkAlive(row.link)) continue;
      const { error: updateError } = await supabase
        .from('events')
        .update({ link: '', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) {
        console.error('[cron/events-archive] link blank failed', updateError);
      } else {
        deadLinksBlanked += 1;
      }
    }
  }

  return NextResponse.json({ archived: data ?? 0, deadLinksBlanked });
}
