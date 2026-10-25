import type { NextResponse } from 'next/server';
import { requireStaffApi } from './requireStaffApi';

// Gate for app/api/admin/**: a signed-in account with profiles.role = 'admin'
// (same check as /dashboard/admin). 401 without a session, 403 for other roles.
export async function requireAdminApi(): Promise<NextResponse | null> {
  const result = await requireStaffApi('admin');
  return result.ok ? null : result.response;
}
