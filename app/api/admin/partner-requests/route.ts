import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';

// Protected by middleware.ts (HTTP Basic Auth on /api/admin/**) — lists
// every partner request, newest first, for the CRM tab.
export async function GET() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('partner_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/partner-requests] list failed', error);
    return NextResponse.json({ error: 'Не удалось загрузить заявки.' }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}
