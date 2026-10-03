import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { requireAdminBasicAuth } from '@/lib/auth/requireAdminBasicAuth';

// A no-argument GET is otherwise statically prerendered at build time, which
// would call createAdminSupabaseClient() without runtime secrets.
export const dynamic = 'force-dynamic';

// Independently protected here as well as in middleware — lists
// every partner request, newest first, for the CRM tab.
export async function GET(request: Request) {
  const denied = requireAdminBasicAuth(request);
  if (denied) return denied;
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
