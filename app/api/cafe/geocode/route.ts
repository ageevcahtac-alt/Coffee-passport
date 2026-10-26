import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { geocodeOnServer } from '@/lib/server/geocode';

export const dynamic = 'force-dynamic';

const MAX_QUERY = 300;
const headers = { 'Cache-Control': 'private, no-store' };

// «Найти на карте по адресу» in /dashboard/cafe/map-profile. Only a signed-in
// cafe_admin may use it — it is not an open proxy to Nominatim.
export async function GET(request: Request) {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth.response;

  const query = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!query || query.length > MAX_QUERY) {
    return NextResponse.json({ error: 'Укажите адрес.', code: 'invalid_query' }, { status: 400, headers });
  }

  const outcome = await geocodeOnServer(query);
  switch (outcome.status) {
    case 'ok':
      return NextResponse.json(outcome.result, { headers });
    case 'not_found':
      return NextResponse.json({ error: 'Адрес не найден.', code: 'not_found' }, { status: 404, headers });
    case 'busy':
      return NextResponse.json(
        { error: 'Поиск занят, попробуйте через пару секунд.', code: 'busy' },
        { status: 429, headers: { ...headers, 'Retry-After': '2' } }
      );
    default:
      return NextResponse.json({ error: 'Поиск адреса недоступен.', code: 'upstream_error' }, { status: 502, headers });
  }
}
