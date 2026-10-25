import type { createAdminSupabaseClient } from '@/lib/supabase/adminClient';

type Admin = ReturnType<typeof createAdminSupabaseClient>;

export type GrantResult = 'granted' | 'no_card' | 'reissued' | 'failed';

export async function baristaCardExists(admin: Admin, binding: { cafeId: string; baristaId: string }): Promise<boolean> {
  const card = await admin
    .from('barista_profiles')
    .select('id')
    .eq('id', binding.baristaId)
    .eq('coffee_shop_id', binding.cafeId)
    .maybeSingle();
  return !card.error && Boolean(card.data);
}

// Gives a cafe-created login its barista rights (profiles.role) — called only
// once the owner's own password has replaced the temporary one, never before
// (lib/auth/temporaryPassword.ts). The cafe may re-issue a temporary password
// at any moment (app/api/cafe/staff/barista-accounts PATCH: rights off, then
// the flag on), so after the grant the flag is read again: if it is back on,
// the rights go off again. Either order of the two leaves no temporary
// password holding barista rights.
export async function grantPendingBaristaRights(
  admin: Admin,
  userId: string,
  binding: { cafeId: string; baristaId: string }
): Promise<GrantResult> {
  if (!(await baristaCardExists(admin, binding))) return 'no_card';

  const granted = await admin
    .from('profiles')
    .upsert(
      { id: userId, role: 'barista', cafe_id: binding.cafeId, roaster_id: null, barista_id: binding.baristaId },
      { onConflict: 'id' }
    );
  if (granted.error) {
    console.error('[barista-rights] grant failed:', granted.error.message);
    return 'failed';
  }

  const fresh = await admin.auth.admin.getUserById(userId);
  if (fresh.error || !fresh.data.user || fresh.data.user.app_metadata?.must_change_password === true) {
    const revoked = await admin.from('profiles').update({ role: 'enthusiast', cafe_id: null, barista_id: null }).eq('id', userId);
    if (revoked.error) console.error('[barista-rights] revoke after re-issue failed:', revoked.error.message);
    return fresh.error ? 'failed' : 'reissued';
  }
  return 'granted';
}
