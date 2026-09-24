import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { xoAdmin } from '@/lib/integrations/xoAdmin';
import { adminJson } from '@/lib/orders/respond';

// The roastery's production queue, from the existing roaster cabinet. Scope
// is the signed-in roaster_admin's own profiles.roaster_id: Admin returns
// only production of the units mapped to that roaster (XO roastery -> XO
// production; a partner roaster -> its own units only, never XO's).
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireStaffApi('roaster_admin');
  if (!auth.ok) return auth.response;
  if (!auth.profile.roasterId) {
    return NextResponse.json({ error: 'Ростерия аккаунта не определена.', code: 'forbidden' }, { status: 403 });
  }
  return adminJson(await xoAdmin.listProduction(auth.profile.roasterId));
}
