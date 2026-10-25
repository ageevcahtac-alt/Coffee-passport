import { headers } from 'next/headers';
import { requireAdminBasicAuth } from '@/lib/auth/requireAdminBasicAuth';
import { requireStaffRole } from '@/lib/auth/requireStaffRole';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Same gate as /dashboard/admin: signed in with profiles.role = 'admin'.
  // Transition: valid Basic Auth still renders until role access is proven on prod.
  if (!requireAdminBasicAuth(headers())) return children;
  await requireStaffRole('admin', '/admin');
  return children;
}
