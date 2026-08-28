import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { PARTNER_REQUEST_STATUS_ORDER, type PartnerRequestStatus } from '@/lib/types/partnerRequest';

// Protected by middleware.ts (HTTP Basic Auth on /api/admin/**) — updates
// status and/or manager notes for one lead. Partial: only fields present
// in the body are changed.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: { status?: string; manager_notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 });
  }

  const update: { status?: PartnerRequestStatus; manager_notes?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (body.status !== undefined) {
    if (!PARTNER_REQUEST_STATUS_ORDER.includes(body.status as PartnerRequestStatus)) {
      return NextResponse.json({ error: 'Неизвестный статус.' }, { status: 400 });
    }
    update.status = body.status as PartnerRequestStatus;
  }
  if (body.manager_notes !== undefined) {
    update.manager_notes = body.manager_notes;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('partner_requests')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    console.error('[admin/partner-requests] update failed', error);
    return NextResponse.json({ error: 'Не удалось обновить заявку.' }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
