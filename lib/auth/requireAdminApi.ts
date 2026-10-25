import type { NextResponse } from 'next/server';
import { requireAdminBasicAuth } from './requireAdminBasicAuth';
import { requireStaffApi } from './requireStaffApi';

// Gate for app/api/admin/**: a signed-in account with profiles.role = 'admin'
// (same check as /dashboard/admin). Transition: valid Basic Auth still passes
// until role access is proven on prod, then the Basic branch goes away.
export async function requireAdminApi(request: Request): Promise<NextResponse | null> {
  if (!requireAdminBasicAuth(request)) return null;
  const result = await requireStaffApi('admin');
  return result.ok ? null : result.response;
}
