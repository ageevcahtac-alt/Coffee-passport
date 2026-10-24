'use client';

import { syncBaristaProfilesFromSupabase } from './baristaProfileStore';
import { syncCafeMenuFromSupabase } from './cafeMenuStore';

// Data the barista dashboard needs from Supabase on open. Staff dashboards
// sit outside app/(site)/layout.tsx, so CurrentUserProvider's app-wide syncs
// never run there — without the profiles sync a barista created from the cafe
// cabinet (absent from the static BARISTAS seed) is never found and the page
// renders nothing.
export async function syncBaristaDashboard(cafeId: string): Promise<void> {
  await Promise.allSettled([syncBaristaProfilesFromSupabase(), syncCafeMenuFromSupabase(cafeId)]);
}
