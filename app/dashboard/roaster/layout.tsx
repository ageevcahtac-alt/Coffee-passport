import { requireStaffRole } from '@/lib/auth/requireStaffRole';
import { StaffSessionProvider } from '@/lib/auth/staffSession';

export default async function RoasterDashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaffRole('roaster_admin', '/dashboard/roaster');
  return <StaffSessionProvider profile={profile}>{children}</StaffSessionProvider>;
}
