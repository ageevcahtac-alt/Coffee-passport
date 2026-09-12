import { createClient } from '@supabase/supabase-js';

// A plain (non-SSR, non-cookie) Supabase client for server-side route
// handlers that read data already public under RLS (e.g. public.lots,
// public.roasters — see 0025_canonical_lot_rls.sql's `using (true)` select
// policies) and therefore need no elevated privilege. Deliberately uses
// the anon key, never SUPABASE_SERVICE_ROLE_KEY — unlike
// lib/supabase/adminClient.ts (which exists specifically for tables RLS has
// locked down from anon, e.g. partner_requests), a route reading only
// already-public Canonical Lot data has no reason to hold a
// service-role credential at all. Least privilege: this client can do
// nothing an anonymous guest's own browser couldn't already do.
export function createPublicSupabaseClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
