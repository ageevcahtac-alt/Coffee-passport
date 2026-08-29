import { FLAVOR_AXES, type RoasterFlavorProfile, type TastingRecord } from '@/lib/types/coffee';
import { getMergedLotById } from '@/lib/data/lotsStore';

// Client-side mirror of the `taste_profile` / `favorite_regions` /
// `favorite_processes` aggregates computed server-side by
// recompute_taste_profile() in supabase/migrations/0004_taste_profile.sql —
// same rules (taste axes only from rating >= 4, top-5 by count), just run
// over the local TastingRecord[] since the journal isn't wired to Supabase
// yet (see lib/journey/store.ts).

const HIGH_RATING_THRESHOLD = 4;
const TOP_LIST_LIMIT = 5;

export interface TasteProfile extends RoasterFlavorProfile {
  sampleSize: number;
}

export interface FavoriteCount {
  label: string;
  count: number;
}

export function computeTasteProfile(records: TastingRecord[]): TasteProfile {
  const highRated = records.filter((record) => record.rating >= HIGH_RATING_THRESHOLD);
  if (highRated.length === 0) {
    return { acidity: 0, sweetness: 0, body: 0, bitterness: 0, sampleSize: 0 };
  }

  const totals = { acidity: 0, sweetness: 0, body: 0, bitterness: 0 };
  for (const record of highRated) {
    for (const { key } of FLAVOR_AXES) {
      totals[key] += record.guestFlavorProfile[key];
    }
  }

  const round = (n: number) => Math.round((n / highRated.length) * 100) / 100;
  return {
    acidity: round(totals.acidity),
    sweetness: round(totals.sweetness),
    body: round(totals.body),
    bitterness: round(totals.bitterness),
    sampleSize: highRated.length,
  };
}

function topCounts(values: (string | undefined)[], limit: number): FavoriteCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function computeFavoriteRegions(records: TastingRecord[], limit = TOP_LIST_LIMIT): FavoriteCount[] {
  return topCounts(
    records.map((record) => getMergedLotById(record.lotId)?.country),
    limit
  );
}

export function computeFavoriteProcesses(records: TastingRecord[], limit = TOP_LIST_LIMIT): FavoriteCount[] {
  return topCounts(
    records.map((record) => getMergedLotById(record.lotId)?.process),
    limit
  );
}

// How closely a guest's aggregate taste profile matches a specific lot's
// roaster-defined flavor profile — average per-axis distance (0-5 scale)
// converted to a 0-100% match, shown on the B2B guest-taste widget so a
// partner can tell at a glance whether a lot suits a given guest.
export function tasteMatchPercent(guest: RoasterFlavorProfile, lot: RoasterFlavorProfile): number {
  const maxDiff = 5;
  const totalDiff = FLAVOR_AXES.reduce((sum, { key }) => sum + Math.abs(guest[key] - lot[key]), 0);
  const avgDiff = totalDiff / FLAVOR_AXES.length;
  return Math.round((1 - avgDiff / maxDiff) * 100);
}
