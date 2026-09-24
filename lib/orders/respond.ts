import { NextResponse } from 'next/server';
import type { AdminResult } from '@/lib/integrations/xoAdmin';

// JSON for an Admin outcome, never cached (it is live authoritative state).
const NO_STORE = { 'Cache-Control': 'no-store' };

export function adminJson<T>(result: AdminResult<T>, successStatus = 200) {
  return result.ok
    ? NextResponse.json({ data: result.data }, { status: successStatus, headers: NO_STORE })
    : NextResponse.json({ error: result.error, code: result.code }, { status: result.status, headers: NO_STORE });
}

export function badRequest(error: string) {
  return NextResponse.json({ error, code: 'invalid' }, { status: 400, headers: NO_STORE });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
