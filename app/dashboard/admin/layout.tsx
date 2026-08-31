import { requireStaffRole } from '@/lib/auth/requireStaffRole';
import { StaffSessionProvider } from '@/lib/auth/staffSession';

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaffRole('admin', '/dashboard/admin');
  return <StaffSessionProvider profile={profile}>{children}</StaffSessionProvider>;
}
