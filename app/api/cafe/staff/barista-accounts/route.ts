import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient';
import {
  TEMPORARY_PASSWORD_MAX,
  TEMPORARY_PASSWORD_MIN,
  pendingBaristaBinding,
  pendingBaristaMetadata,
  temporaryPasswordExpiresAt,
  temporaryPasswordState,
} from '@/lib/auth/temporaryPassword';

// Cafe cabinet → «Команда»: the cafe creates a barista login (POST), sees its
// logins (GET) and issues a new temporary password (PATCH). The temporary
// password lives 72 hours; until its owner replaces it the login has an
// 'enthusiast' profile — no barista rights anywhere in the database — and the
// cafe/barista binding waits in app_metadata (see lib/auth/temporaryPassword.ts
// and app/auth/change-password/actions.ts, which grants the role).
//
// cafe_id always comes from the cafe_admin's own profile, never the body.
// An email that already has an account is refused (409), never re-bound:
// otherwise any cafe could take over a guest's or another cafe's login.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// GoTrue pages the admin user list; a pilot has far fewer logins than this.
const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 20;

type Admin = ReturnType<typeof createAdminSupabaseClient>;
type AuthUser = { id: string; email?: string; created_at?: string; app_metadata?: Record<string, unknown> };

const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });

async function cafeAdminContext(): Promise<{ ok: true; cafeId: string; admin: Admin } | { ok: false; response: NextResponse }> {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth;
  const cafeId = auth.profile.cafeId;
  if (!cafeId) return { ok: false, response: fail(403, 'forbidden', 'У аккаунта нет кофейни.') };
  try {
    return { ok: true, cafeId, admin: createAdminSupabaseClient() };
  } catch {
    return { ok: false, response: fail(503, 'admin_unavailable', 'Управление учётками временно недоступно.') };
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function invalidPassword(password: string) {
  return password.length < TEMPORARY_PASSWORD_MIN || password.length > TEMPORARY_PASSWORD_MAX
    ? fail(400, 'invalid_password', `Временный пароль — от ${TEMPORARY_PASSWORD_MIN} до ${TEMPORARY_PASSWORD_MAX} символов.`)
    : null;
}

async function allUsers(admin: Admin): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw new Error(error.code ?? 'list_users_failed');
    users.push(...(data.users as AuthUser[]));
    if (data.users.length < USERS_PER_PAGE) break;
  }
  return users;
}

const BARISTA_RIGHTS = (cafeId: string, baristaId: string) => ({ role: 'barista', cafe_id: cafeId, barista_id: baristaId });
const NO_RIGHTS = { role: 'enthusiast', cafe_id: null, barista_id: null };

export async function POST(request: Request) {
  const context = await cafeAdminContext();
  if (!context.ok) return context.response;
  const { cafeId, admin } = context;

  const body = await readBody(request);
  if (!body) return fail(400, 'invalid_body', 'Некорректный запрос.');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';

  if (!name || name.length > 60) return fail(400, 'invalid_name', 'Укажите имя (до 60 символов).');
  if (!EMAIL_RE.test(email) || email.length > 254) return fail(400, 'invalid_email', 'Укажите корректный email.');
  const badPassword = invalidPassword(password);
  if (badPassword) return badPassword;

  const baristaId = `barista-${randomUUID()}`;
  const metadata = pendingBaristaMetadata(cafeId, baristaId);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: metadata });
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
  // The card is public right away (the guest rating form lists it); the
  // login itself gets barista rights only at the password change.
  const baristaRow = await admin.from('barista_profiles').insert({ id: baristaId, coffee_shop_id: cafeId, name });
  const profileRow = baristaRow.error
    ? null
    : await admin
        .from('profiles')
        .upsert({ id: userId, ...NO_RIGHTS, roaster_id: null, display_name: name }, { onConflict: 'id' });

  if (baristaRow.error || !profileRow || profileRow.error) {
    console.error(
      '[barista-accounts] profile write failed, rolling back:',
      baristaRow.error?.message ?? profileRow?.error?.message ?? 'unknown'
    );
    await admin.from('barista_profiles').delete().eq('id', baristaId);
    await admin.auth.admin.deleteUser(userId);
    return fail(500, 'create_failed', 'Не удалось создать учётку.');
  }

  return NextResponse.json({ baristaId, email, expiresAt: metadata.temporary_password_expires_at }, { status: 201 });
}

export async function GET() {
  const context = await cafeAdminContext();
  if (!context.ok) return context.response;
  const { cafeId, admin } = context;

  const [cards, active] = await Promise.all([
    admin.from('barista_profiles').select('id, name').eq('coffee_shop_id', cafeId),
    admin.from('profiles').select('id, barista_id').eq('role', 'barista').eq('cafe_id', cafeId),
  ]);
  if (cards.error || active.error) return fail(500, 'list_failed', 'Не удалось загрузить учётки.');
  const names = new Map((cards.data as { id: string; name: string }[]).map((card) => [card.id, card.name]));
  const activeBarista = new Map((active.data as { id: string; barista_id: string }[]).map((row) => [row.id, row.barista_id]));

  let users: AuthUser[];
  try {
    users = await allUsers(admin);
  } catch (error) {
    console.error('[barista-accounts] listUsers failed:', error instanceof Error ? error.message : 'unknown');
    return fail(500, 'list_failed', 'Не удалось загрузить учётки.');
  }

  const accounts = users.flatMap((user) => {
    const binding = pendingBaristaBinding(user);
    const baristaId = activeBarista.get(user.id) ?? (binding?.cafeId === cafeId ? binding.baristaId : undefined);
    if (!baristaId || !names.has(baristaId)) return [];
    const state = temporaryPasswordState(user);
    const expiresAt = state === 'none' ? null : temporaryPasswordExpiresAt(user);
    return [
      {
        baristaId,
        name: names.get(baristaId)!,
        email: user.email ?? '',
        status: state === 'none' ? 'active' : state === 'active' ? 'pending' : 'expired',
        expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      },
    ];
  });
  accounts.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return NextResponse.json({ accounts });
}

export async function PATCH(request: Request) {
  const context = await cafeAdminContext();
  if (!context.ok) return context.response;
  const { cafeId, admin } = context;

  const body = await readBody(request);
  if (!body) return fail(400, 'invalid_body', 'Некорректный запрос.');
  const baristaId = typeof body.baristaId === 'string' ? body.baristaId : '';
  const password = typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';
  const badPassword = invalidPassword(password);
  if (badPassword) return badPassword;

  const card = await admin.from('barista_profiles').select('id').eq('id', baristaId).eq('coffee_shop_id', cafeId).maybeSingle();
  if (card.error) return fail(500, 'reissue_failed', 'Не удалось выдать пароль.');
  if (!card.data) return fail(404, 'not_found', 'Такого бариста в вашей кофейне нет.');

  const activeRow = await admin
    .from('profiles')
    .select('id')
    .eq('barista_id', baristaId)
    .eq('role', 'barista')
    .eq('cafe_id', cafeId)
    .maybeSingle();
  if (activeRow.error) return fail(500, 'reissue_failed', 'Не удалось выдать пароль.');

  let users: AuthUser[];
  try {
    users = await allUsers(admin);
  } catch (error) {
    console.error('[barista-accounts] listUsers failed:', error instanceof Error ? error.message : 'unknown');
    return fail(500, 'reissue_failed', 'Не удалось выдать пароль.');
  }
  const activeId = (activeRow.data as { id: string } | null)?.id;
  const user = users.find((candidate) => {
    if (activeId) return candidate.id === activeId;
    const binding = pendingBaristaBinding(candidate);
    return binding?.cafeId === cafeId && binding.baristaId === baristaId;
  });
  if (!user) return fail(404, 'no_account', 'У этого бариста нет учётки. Создайте её кнопкой «+ Добавить сотрудника».');

  // Rights go first: from here until the new password is replaced, nothing
  // in the database answers to this login as a barista. Always, not only
  // when the profile read above said "barista": a password change running
  // right now may grant the role after that read.
  const demoted = await admin.from('profiles').update(NO_RIGHTS).eq('id', user.id);
  if (demoted.error) {
    console.error('[barista-accounts] demote failed:', demoted.error.message);
    return fail(500, 'reissue_failed', 'Не удалось выдать пароль.');
  }

  const metadata = pendingBaristaMetadata(cafeId, baristaId);
  const { error } = await admin.auth.admin.updateUserById(user.id, { password, app_metadata: metadata });
  if (error) {
    if (activeId) await admin.from('profiles').update(BARISTA_RIGHTS(cafeId, baristaId)).eq('id', user.id);
    if (error.code === 'weak_password') return fail(400, 'invalid_password', 'Пароль слишком простой. Выберите другой.');
    console.error('[barista-accounts] reissue failed:', error.code ?? error.status ?? 'unknown');
    return fail(500, 'reissue_failed', 'Не удалось выдать пароль.');
  }

  // And once more after the flag is on: a grant that slipped in between
  // (lib/auth/grantBaristaRights.ts) cannot outlive the new temporary password.
  const settled = await admin.from('profiles').update(NO_RIGHTS).eq('id', user.id);
  if (settled.error) {
    console.error('[barista-accounts] demote after reissue failed:', settled.error.message);
    return fail(500, 'reissue_failed', 'Не удалось выдать пароль. Попробуйте ещё раз.');
  }

  return NextResponse.json({ baristaId, email: user.email ?? '', expiresAt: metadata.temporary_password_expires_at });
}
