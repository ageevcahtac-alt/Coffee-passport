import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRole } from '@/lib/types/database';
import type { StaffProfile } from './staffSession';

// Route-handler twin of requireStaffRole.ts: same session + profiles.role
// check, but answers JSON 401/403 instead of redirecting (a fetch() from the
// cabinet can't follow a redirect to the login page meaningfully). Every
// scoped id a caller of this uses (cafe_id, roaster_id) comes from the
// returned profile — i.e. from the database row of the signed-in user —
// never from the request.
export async function requireStaffApi(
  role: ProfileRole
): Promise<{ ok: true; profile: StaffProfile } | { ok: false; response: NextResponse }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Требуется вход.', code: 'unauthenticated' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cafe_id, roaster_id, barista_id, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.role !== role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Этот аккаунт не имеет доступа к этому разделу.', code: 'forbidden' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    profile: {
      userId: user.id,
      role: profile.role,
      cafeId: profile.cafe_id,
      roasterId: profile.roaster_id,
      baristaId: profile.barista_id,
      displayName: profile.display_name,
    },
  };
}
