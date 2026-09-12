import { NextResponse } from 'next/server';
import { createPublicSupabaseClient } from '@/lib/supabase/publicServerClient';
import { isXoStoreIntegrationRequestAuthorized } from '@/lib/integrations/xoStoreAuth';

// P23 — Coffee Passport → XO COFFEE Store read-only integration boundary.
//
// Scope, deliberately narrow (see P20/P23 reports): this endpoint exists
// for exactly one relationship, XO COFFEE Store reading XO COFFEE
// Roasting's own Canonical Lots — not a general "Lots by any roaster" API.
// The roaster is therefore hardcoded server-side, never accepted from the
// caller (no `?roaster=` param): accepting one would turn this into a
// general-purpose data-exposure endpoint for every roaster in a
// multi-roaster platform, which is explicitly out of scope.
//
// Next.js App Router caches GET responses/fetches by default — without
// this, a newly-created Lot could keep serving a stale snapshot for an
// arbitrary TTL, defeating the whole point of an automatic bridge (see
// app/api/events/route.ts for the same fix, same reasoning).
export const dynamic = 'force-dynamic';

const XO_ROASTER_SLUG = 'roaster-xo';

interface CoffeeOrigin {
  country: string | null;
  region: string | null;
  variety: string | null;
  processing: string | null;
}

interface LotForIntegration {
  public_id: string;
  name: string;
  q_grade: number | null;
  green_lots: { coffees: CoffeeOrigin | null } | null;
}

export async function GET(request: Request) {
  if (!isXoStoreIntegrationRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createPublicSupabaseClient();

  // Step 1: resolve XO COFFEE Roasting's uuid from its stable slug — the
  // same profiles.roaster_id (text) -> roasters.id (uuid) bridge pattern
  // 0025_canonical_lot_rls.sql's is_roaster_staff_for() already uses,
  // applied here for a read instead of a write policy. Never a
  // caller-supplied value.
  const { data: roaster, error: roasterError } = await supabase
    .from('roasters')
    .select('id')
    .eq('slug', XO_ROASTER_SLUG)
    .maybeSingle();

  if (roasterError || !roaster) {
    console.error('[api/integrations/xo-store/lots] roaster lookup failed', roasterError);
    return NextResponse.json({ error: 'Failed to load lots' }, { status: 500 });
  }

  // Step 2: every Lot owned by that roaster — the same roaster_id-scoped
  // shape lib/data/canonicalLotStore.ts's listCanonicalLotsForRoaster()
  // already proves out for the roaster's own dashboard, reimplemented here
  // (not imported) because that function is a 'use client' browser-only
  // module built for the signed-in roaster's own session; this route needs
  // the equivalent read from a server context with no session at all. The
  // coffees join mirrors lib/data/lotsStore.ts's syncLotsFromSupabase()
  // nested-select shape (green_lots(coffees(...))) rather than inventing a
  // new join path.
  //
  // Filter: status='active' (excludes draft/testing/archived — in
  // particular the four P16 E2E `TEST FLOW A-D` fixtures, all status
  // 'draft', per P18/P19) AND in_roaster_catalog=true (the roaster's own
  // "still current" flag). No new status was invented for this — both
  // columns already exist and already mean exactly this.
  const { data: lots, error: lotsError } = await supabase
    .from('lots')
    .select('public_id, name, q_grade, green_lots(coffees(country, region, variety, processing))')
    .eq('roaster_id', roaster.id)
    .eq('status', 'active')
    .eq('in_roaster_catalog', true)
    .order('created_at', { ascending: false });

  if (lotsError || !lots) {
    console.error('[api/integrations/xo-store/lots] lots query failed', lotsError);
    return NextResponse.json({ error: 'Failed to load lots' }, { status: 500 });
  }

  return NextResponse.json({
    lots: (lots as unknown as LotForIntegration[]).map((lot) => {
      const coffee = lot.green_lots?.coffees ?? null;
      return {
        public_id: lot.public_id,
        name: lot.name,
        country: coffee?.country ?? '',
        region: coffee?.region ?? '',
        variety: coffee?.variety ?? '',
        process: coffee?.processing ?? '',
        q_grade: lot.q_grade,
      };
    }),
  });
}
