import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { isCronRequestAuthorized } from '@/lib/events/cronAuth';

// Daily expiry pass for lots a cafe marked "Выводим из ассортимента" with a
// scheduled removal date — any whose scheduled_removal_at has passed gets
// is_active flipped off (removed from the guest-facing menu), same
// authoritative-server-side-cron pattern as
// app/api/cron/events-archive/route.ts. Reuses that route's cron secret
// (isCronRequestAuthorized) rather than introducing a second one — this
// repo has exactly one trusted external scheduler
// (.github/workflows/events-cron.yml), not one per feature.
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc('cafe_menu_expire_discontinuing');

  if (error) {
    console.error('[cron/cafe-menu-expire] failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ removed: data ?? 0 });
}
