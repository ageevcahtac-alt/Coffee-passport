import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import { sendPartnerRequestNotification } from '@/lib/email/sendPartnerRequestNotification';
import type { PartnerRequestInput } from '@/lib/types/partnerRequest';

// Public endpoint — the "Стать партнёром" modal on the landing page posts
// here. No auth: anyone should be able to submit a lead. Persistence and
// the email notification are independent — a notification failure never
// fails the submission (see sendPartnerRequestNotification).
export async function POST(request: Request) {
  let body: Partial<PartnerRequestInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 });
  }

  const company_name = (body.company_name ?? '').trim();
  const contact_name = (body.contact_name ?? '').trim();
  const email = (body.email ?? '').trim();

  if (!company_name || !contact_name || !email) {
    return NextResponse.json(
      { error: 'Заполните название компании, ФИО и email.' },
      { status: 400 }
    );
  }

  const input: PartnerRequestInput = {
    company_name,
    city: (body.city ?? '').trim(),
    contact_name,
    email,
    phone: (body.phone ?? '').trim(),
    comment: (body.comment ?? '').trim(),
    role_requested: body.role_requested === 'roaster' ? 'roaster' : 'coffee_shop',
  };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from('partner_requests').insert({
    company_name: input.company_name,
    city: input.city || null,
    contact_name: input.contact_name,
    email: input.email,
    phone: input.phone || null,
    comment: input.comment || null,
    role_requested: input.role_requested,
  });

  if (error) {
    console.error('[partner-requests] insert failed', error);
    return NextResponse.json(
      { error: 'Не удалось сохранить заявку. Попробуйте ещё раз чуть позже.' },
      { status: 500 }
    );
  }

  await sendPartnerRequestNotification(input);

  return NextResponse.json({ ok: true });
}
