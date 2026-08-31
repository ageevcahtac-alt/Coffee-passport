import { requireStaffRole } from '@/lib/auth/requireStaffRole';
import { StaffSessionProvider } from '@/lib/auth/staffSession';
import { StaffFeedbackWidget } from '@/components/shared/StaffFeedbackWidget';

// Wraps every route under /dashboard/cafe — the (hub) group (menu,
// team, analytics, equipment) as well as its siblings outside that group
// (add-lot, [lotId]/edit, staff/*), since a route group doesn't nest a
// layout for its siblings automatically.
export default async function CafeDashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaffRole('cafe_admin', '/dashboard/cafe');
  return (
    <StaffSessionProvider profile={profile}>
      {children}
      <StaffFeedbackWidget />
    </StaffSessionProvider>
  );
}
