import type { ProfileRole } from '@/lib/types/database';

export type PilotStaffRole = Exclude<ProfileRole, 'enthusiast'>;

// The three staff dashboards now gated by requireStaffRole.ts (see
// app/dashboard/*/layout.tsx) — DevRoleSwitcher uses this to render one
// "sign in as the pilot X" button per role, and app/auth/actions.ts's
// signInAsPilotStaff uses it to resolve which env vars + destination each
// one maps to. Single source of truth so the two stay in sync.
export const PILOT_STAFF_ROLES: {
  role: PilotStaffRole;
  label: string;
  icon: string;
  dashboardPath: string;
}[] = [
  { role: 'cafe_admin', label: 'Кофейня', icon: '🏪', dashboardPath: '/dashboard/cafe' },
  { role: 'roaster_admin', label: 'Обжарщик', icon: '🏭', dashboardPath: '/dashboard/roaster' },
  { role: 'barista', label: 'Бариста', icon: '🧑‍🍳', dashboardPath: '/dashboard/barista' },
];
