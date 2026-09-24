import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { xoAdmin } from '@/lib/integrations/xoAdmin';
import { adminJson } from '@/lib/orders/respond';
import { isUuid } from '@/lib/orders/roasteryOrders';

export const dynamic = 'force-dynamic';

/** GET — one production job with its authoritative timeline; 404 outside the roaster's own units. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireStaffApi('roaster_admin');
  if (!auth.ok) return auth.response;
  if (!auth.profile.roasterId) {
    return NextResponse.json({ error: 'Ростерия аккаунта не определена.', code: 'forbidden' }, { status: 403 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: 'Не найдено.', code: 'not_found' }, { status: 404 });
  }
  return adminJson(await xoAdmin.getProduction(params.id, auth.profile.roasterId));
}
