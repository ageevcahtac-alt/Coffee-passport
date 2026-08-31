'use client';

import { useStaffSession } from '@/lib/auth/staffSession';
import { FeedbackWidget } from './FeedbackWidget';

// Mounted in each staff dashboard's top-level layout.tsx (roaster/cafe/
// barista/admin) — reads the already-guaranteed-authenticated session from
// requireStaffRole.ts's provider.
export function StaffFeedbackWidget() {
  const { userId, role } = useStaffSession();
  return <FeedbackWidget userId={userId} role={role} isAuthenticated />;
}
