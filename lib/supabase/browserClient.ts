'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

// Client-component counterpart to lib/supabase/server.ts — shares the same
// cookie-based session (set by the server actions in app/auth/actions.ts),
// so a signed-in enthusiast's requests here carry their real auth.uid()
// automatically, no manual token plumbing. Used by the sync layer in
// lib/journey/store.ts, lib/data/brewingRecipesStore.ts and
// lib/data/equipmentStore.ts — see supabase/migrations/0005_recipes_equipment_checkins.sql
// for the RLS these calls run under.
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getBrowserSupabaseClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
