import { NextResponse } from 'next/server';
import { createPublicSupabaseClient } from '@/lib/supabase/publicServerClient';

// Liveness + database probe for deploy checks (deploy/timeweb/update-app.sh)
// and uptime monitoring. Reads one row of public.lots with the anon key —
// already public under RLS (0025_canonical_lot_rls.sql), so the probe needs
// no elevated credential and returns no data. The response says only
// whether the database answered; the real failure reason goes to the
// server log, never to the caller.
export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 10_000;

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  try {
    const { error } = await createPublicSupabaseClient()
      .from('lots')
      .select('public_id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) {
      console.error('[health] database query failed:', error.message);
    } else {
      dbOk = true;
    }
  } catch (error) {
    console.error('[health] database unreachable:', error instanceof Error ? error.message : error);
  }

  return NextResponse.json(
    dbOk
      ? { status: 'ok', db: 'ok', db_latency_ms: Date.now() - started }
      : { status: 'error', db: 'error' },
    { status: dbOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
