import Link from 'next/link';
import { getRoasterById } from '@/lib/data/roasters';
import { getMergedLotById } from '@/lib/data/lotsStore';
import type { Lot, TastingRecord } from '@/lib/types/coffee';

// The "business card" shown when a guest clicks a pin — scoped to one
// roaster across the guest's WHOLE journey (not just the clicked country),
// since "счётчик открытых регионов" and the lot list are brand-wide totals.
export function RoasterProfileCard({
  roasterId,
  records,
}: {
  roasterId: string;
  records: TastingRecord[];
}) {
  const roaster = getRoasterById(roasterId);
  if (!roaster) return null;

  const roasterRecords = records.filter((record) => record.roasterId === roasterId);
  const lotIds = Array.from(new Set(roasterRecords.map((record) => record.lotId)));
  const lots = lotIds
    .map((id) => getMergedLotById(id))
    .filter((lot): lot is Lot => Boolean(lot))
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  const regionsCount = new Set(lots.map((lot) => lot.country)).size;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: roaster.color }}
          aria-hidden="true"
        />
        <h3 className="font-display text-lg text-ink-900 leading-tight">{roaster.name}</h3>
      </div>

      <p className="text-sm text-ink-700 leading-relaxed mb-5">{roaster.philosophy}</p>

      <dl className="grid gap-2.5 text-sm mb-5">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Локация производства</dt>
          <dd className="text-ink-900 text-right">
            {roaster.city}, {roaster.country}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-400 shrink-0">Регионов открыто</dt>
          <dd className="data-value text-gold-500 text-right">{regionsCount}</dd>
        </div>
      </dl>

      <p className="section-label mb-3">Продегустированные лоты</p>
      <ul className="flex flex-col gap-1.5">
        {lots.map((lot) => (
          <li key={lot.id}>
            <Link
              href={`/passport/${lot.id}`}
              className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 -mx-2.5
                         text-sm text-ink-700 hover:bg-parchment-200 hover:text-ink-900
                         transition-colors"
            >
              <span>{lot.name}</span>
              <span className="data-value text-xs text-ink-400 shrink-0">{lot.country}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
