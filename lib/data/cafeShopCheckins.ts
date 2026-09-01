'use client';

import type { CheckinRow } from '@/lib/types/database';
import type { TastingRecord } from '@/lib/types/coffee';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { rowToRecord } from '@/lib/journey/store';

// The cafe/barista dashboards' real read of a shop's guest checkins —
// unlike useJourney() (lib/journey/store.ts), which only ever holds the
// CURRENTLY SIGNED-IN account's own checkins (syncCheckinsForUser filters
// `.eq('owner_user_id', userId)`), this queries every checkin for the shop
// directly, which the "shop staff read own shop checkins" RLS policy (see
// supabase/migrations/0007_staff_profiles_rls.sql) already grants a
// cafe_admin/barista session in full — barista_rating/barista_note
// included, since that policy (unlike the roaster's anonymized view) is
// meant for a shop reading its own guests' full feedback. Without this, a
// real cafe_admin/barista signing in on a fresh device would see
// approximately zero guest reviews for their own shop even though guests
// really did leave them.
export async function fetchShopCheckins(shopId: string): Promise<TastingRecord[]> {
  if (!shopId) return [];
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('checkins').select('*').eq('coffee_shop_id', shopId);
    if (error || !data) return [];
    return (data as CheckinRow[]).map(rowToRecord);
  } catch {
    return [];
  }
}
