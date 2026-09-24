import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { xoAdmin } from '@/lib/integrations/xoAdmin';
import { adminJson, badRequest, readJson } from '@/lib/orders/respond';
import { isUuid, parseTransitionRequest } from '@/lib/orders/roasteryOrders';

export const dynamic = 'force-dynamic';

/**
 * POST { to, units? } — start / complete (produced units) / ready for
 * shipping / ship (shipped units). Admin re-checks scope, acceptance, status
 * and quantity and answers with the fresh authoritative state; Passport never
 * treats its own copy as the truth.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireStaffApi('roaster_admin');
  if (!auth.ok) return auth.response;
  if (!auth.profile.roasterId) {
    return NextResponse.json({ error: 'Ростерия аккаунта не определена.', code: 'forbidden' }, { status: 403 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: 'Не найдено.', code: 'not_found' }, { status: 404 });
  }
  const parsed = parseTransitionRequest(await readJson(request));
  if (!parsed.ok) return badRequest(parsed.error);

  return adminJson(
    await xoAdmin.transitionProduction(params.id, {
      roasterId: auth.profile.roasterId,
      actorUserId: auth.profile.userId,
      to: parsed.value.to,
      units: parsed.value.units,
    })
  );
}
