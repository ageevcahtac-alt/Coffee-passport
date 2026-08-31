import { requireStaffRole } from '@/lib/auth/requireStaffRole';
import { StaffSessionProvider } from '@/lib/auth/staffSession';
import { StaffFeedbackWidget } from '@/components/shared/StaffFeedbackWidget';

export default async function BaristaDashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaffRole('barista', '/dashboard/barista');
  return (
    <StaffSessionProvider profile={profile}>
      {children}
      <StaffFeedbackWidget />
    </StaffSessionProvider>
  );
}
