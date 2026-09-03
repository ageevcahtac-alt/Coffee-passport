import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { isCronRequestAuthorized } from '@/lib/events/cronAuth';

// Daily archive pass: any event whose end_date is in the past flips from
// 'active' to 'archived' — it drops off the public board (/api/events'
// own filter) but the row stays in the table for the admin's "Архив" tab
// and history. Intended to be hit once a day by an external scheduler —
// see .github/workflows/events-cron.yml for the one wired up in this repo.
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

  return NextResponse.json({ archived: data ?? 0 });
}
