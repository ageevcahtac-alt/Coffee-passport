import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';

// Cafe cabinet → "Доступ в кабинет бариста": the cafe sets the barista's
// email and a temporary password, the barista changes it on first sign-in
// (app_metadata.must_change_password, enforced by requireStaffRole.ts and
// cleared by app/auth/change-password/actions.ts). app_metadata, unlike
// user_metadata, is writable only with the service-role key, so the barista
// cannot clear the flag themselves.
//
// cafe_id always comes from the cafe_admin's own profile, never the body.
// An email that already has an account is refused (409), never re-bound:
// otherwise any cafe could take over a guest's or another cafe's login.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPORARY_PASSWORD_MIN = 12;
const TEMPORARY_PASSWORD_MAX = 128;

const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });

export async function POST(request: Request) {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth.response;
  const cafeId = auth.profile.cafeId;
  if (!cafeId) return fail(403, 'forbidden', 'У аккаунта нет кофейни.');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid_body', 'Некорректный запрос.');
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';

  if (!name || name.length > 60) return fail(400, 'invalid_name', 'Укажите имя (до 60 символов).');
  if (!EMAIL_RE.test(email) || email.length > 254) return fail(400, 'invalid_email', 'Укажите корректный email.');
  if (password.length < TEMPORARY_PASSWORD_MIN || password.length > TEMPORARY_PASSWORD_MAX) {
    return fail(400, 'invalid_password', `Временный пароль — от ${TEMPORARY_PASSWORD_MIN} до ${TEMPORARY_PASSWORD_MAX} символов.`);
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return fail(503, 'admin_unavailable', 'Создание учёток временно недоступно.');
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (created.error || !created.data.user) {
    const error = created.error as { status?: number; code?: string; message?: string } | null;
    if (error?.code === 'email_exists' || /already (been )?registered/i.test(error?.message ?? '')) {
      return fail(409, 'email_exists', 'Аккаунт с этим email уже есть. Укажите другой email.');
    }
    if (error?.code === 'weak_password') {
      return fail(400, 'invalid_password', 'Пароль слишком простой. Выберите другой.');
    }
    console.error('[barista-accounts] createUser failed:', error?.code ?? error?.status ?? 'unknown');
    return fail(500, 'create_failed', 'Не удалось создать учётку.');
  }

  const userId = created.data.user.id;
  const baristaId = `barista-${randomUUID()}`;
  const baristaRow = await admin.from('barista_profiles').insert({ id: baristaId, coffee_shop_id: cafeId, name });
  const profileRow = baristaRow.error
    ? null
    : await admin.from('profiles').upsert(
        { id: userId, role: 'barista', cafe_id: cafeId, roaster_id: null, barista_id: baristaId, display_name: name },
        { onConflict: 'id' }
      );

  if (baristaRow.error || !profileRow || profileRow.error) {
    console.error(
      '[barista-accounts] profile write failed, rolling back:',
      baristaRow.error?.message ?? profileRow?.error?.message ?? 'unknown'
    );
    await admin.from('barista_profiles').delete().eq('id', baristaId);
    await admin.auth.admin.deleteUser(userId);
    return fail(500, 'create_failed', 'Не удалось создать учётку.');
  }

  return NextResponse.json({ baristaId, email }, { status: 201 });
}
