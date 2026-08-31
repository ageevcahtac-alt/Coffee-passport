import type { ProfileRole } from '@/lib/types/database';

export type PilotStaffRole = Exclude<ProfileRole, 'enthusiast'>;

// The three staff dashboards now gated by requireStaffRole.ts (see
// app/dashboard/*/layout.tsx) — DevRoleSwitcher uses this to render one
// "sign in as the pilot X" button per role, and
// app/auth/actions.ts's signInAsPilotStaff uses it to resolve which fixed
// demo account/destination each one maps to. Single source of truth so
// the two stay in sync.
//
// email/password are throwaway *@test.com dev fixtures, not secrets —
// deliberately hardcoded (not env vars) so this needs zero manual setup.
// What actually gates them from becoming a real security hole is
// server-side: public.dev_seed_staff_profile() (see
// supabase/migrations/0008_dev_seed_staff_profile.sql) only ever promotes
// a profile when the calling account's email is exactly one of these
// three — signing up as anyone else grants nothing beyond the default
// 'enthusiast' role.
export const PILOT_STAFF_ROLES: {
  role: PilotStaffRole;
  label: string;
  icon: string;
  dashboardPath: string;
  email: string;
}[] = [
  { role: 'cafe_admin', label: 'Кофейня', icon: '🏪', dashboardPath: '/dashboard/cafe', email: 'cafe@test.com' },
  {
    role: 'roaster_admin',
    label: 'Обжарщик',
    icon: '🏭',
    dashboardPath: '/dashboard/roaster',
    email: 'roaster@test.com',
  },
  { role: 'barista', label: 'Бариста', icon: '🧑‍🍳', dashboardPath: '/dashboard/barista', email: 'barista@test.com' },
];

// Shared by every pilot account — fine for throwaway *@test.com fixtures
// that dev_seed_staff_profile() re-derives from an email allowlist
// anyway, not from anything this password protects.
export const PILOT_STAFF_PASSWORD = 'coffee-passport-dev-2026';
