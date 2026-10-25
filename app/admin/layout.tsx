import { requireStaffRole } from '@/lib/auth/requireStaffRole';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Same gate as /dashboard/admin: signed in with profiles.role = 'admin'.
  await requireStaffRole('admin', '/admin');
  return children;
}
