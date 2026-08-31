'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ProfileRole } from '@/lib/types/database';

export interface StaffProfile {
  userId: string;
  role: ProfileRole;
  cafeId: string | null;
  roasterId: string | null;
  baristaId: string | null;
  displayName: string | null;
}

const StaffSessionContext = createContext<StaffProfile | null>(null);

// Populated once, server-side, by requireStaffRole.ts inside each staff
// dashboard's top-level layout.tsx — by the time any page under
// /dashboard/roaster, /dashboard/cafe or /dashboard/barista renders, the
// role check has already passed and this profile is guaranteed non-null,
// so every one of those pages can read cafeId/roasterId/baristaId here
// instead of a hardcoded ACTIVE_*_ID demo constant.
export function StaffSessionProvider({
  profile,
  children,
}: {
  profile: StaffProfile;
  children: ReactNode;
}) {
  return <StaffSessionContext.Provider value={profile}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffProfile {
  const profile = useContext(StaffSessionContext);
  if (!profile) {
    throw new Error('useStaffSession() called outside a StaffSessionProvider — check the dashboard layout.');
  }
  return profile;
}
