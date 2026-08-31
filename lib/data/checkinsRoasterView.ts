'use client';

import type { DefectId, FlavorSubDescriptors, RoasterFlavorProfile, SensoryTagId } from '@/lib/types/coffee';
import type { CheckinRoasterViewRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// The roaster's read of guest checkins — sourced from
// public.checkins_roaster_view (see
// supabase/migrations/0007_staff_profiles_rls.sql), not the shared local
// journey store. That view is anonymized at the database level, not just
// by this type: it has no owner_user_id, no coffee_shop_id, and no
// barista_id/barista_rating/barista_note columns at all, and its own RLS
// join only ever returns rows for the calling roaster_admin's own
// roaster_id. This type mirrors exactly what the view provides — nothing
// more — so there's no accidental path for service/staff data or guest/
// shop identity to reach the roaster dashboard.
export interface AnonymizedCheckin {
  id: string;
  lotId: string;
  roasterId: string;
  brewingMethod: string;
  rating: number;
  guestFlavorProfile: RoasterFlavorProfile;
  sensoryTags: SensoryTagId[];
  subDescriptors: FlavorSubDescriptors;
  defects: DefectId[];
  liked: string;
  disliked: string;
  note: string;
  createdAt: string;
}

function rowToAnonymizedCheckin(row: CheckinRoasterViewRow): AnonymizedCheckin {
  return {
    id: row.id,
    lotId: row.lot_id,
    roasterId: row.roaster_id,
    brewingMethod: row.brewing_method,
    rating: row.rating,
    guestFlavorProfile: {
      acidity: row.acidity,
      sweetness: row.sweetness,
      body: row.body,
      bitterness: row.bitterness,
    },
    sensoryTags: (row.sensory_tags ?? []) as SensoryTagId[],
    subDescriptors: (row.sub_descriptors ?? {}) as FlavorSubDescriptors,
    defects: (row.defects ?? []) as DefectId[],
    liked: row.liked,
    disliked: row.disliked,
    note: row.note,
    createdAt: row.created_at,
  };
}

// Best-effort, same as every other Supabase read in this app: an error
// here (RLS reject because the caller isn't actually a roaster_admin,
// the view/migration not applied yet, offline) just means an empty
// result — LotGuestAnalytics already renders its own "no tastings yet"
// state for that, no separate error UI needed.
export async function fetchAnonymizedCheckinsForRoaster(): Promise<AnonymizedCheckin[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('checkins_roaster_view').select('*');
    if (error || !data) return [];
    return (data as CheckinRoasterViewRow[]).map(rowToAnonymizedCheckin);
  } catch {
    return [];
  }
}
