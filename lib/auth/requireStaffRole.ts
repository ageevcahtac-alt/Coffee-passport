import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRole } from '@/lib/types/database';
import type { StaffProfile } from './staffSession';

// Server-only route guard for the staff dashboards
// (/dashboard/roaster, /dashboard/cafe, /dashboard/barista) — call once,
// from each dashboard's top-level layout.tsx. No session -> straight to
// login; a session that doesn't have the required role -> also back to
// login (with an explanatory ?error=, since the login page already knows
// how to render searchParams.error), never a bare "access denied" page
// that would leak whether a route/role exists to someone probing it.
//
// This is the actual security boundary, backed by the RLS policies in
// supabase/migrations/0007_staff_profiles_rls.sql — but redundant
// defense in depth matters here too: without this check, an
// authenticated-but-wrong-role user would still reach the dashboard UI
// (which would then just render empty, since their Supabase queries for
// this org's data would come back RLS-denied) instead of being told
// plainly that they're signed in with the wrong account.
export async function requireStaffRole(role: ProfileRole, nextPath: string): Promise<StaffProfile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cafe_id, roaster_id, barista_id, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.role !== role) {
    redirect(
      `/auth/login?next=${encodeURIComponent(nextPath)}&error=${encodeURIComponent(
        'Этот аккаунт не имеет доступа к этому кабинету.'
      )}`
    );
  }

  return {
    userId: user.id,
    role: profile.role,
    cafeId: profile.cafe_id,
    roasterId: profile.roaster_id,
    baristaId: profile.barista_id,
    displayName: profile.display_name,
  };
}
