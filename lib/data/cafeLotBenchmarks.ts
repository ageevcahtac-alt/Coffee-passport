'use client';

import type { CheckinRow, CheckinsCafeBenchmarkRow } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// Powers the three per-lot ratings on the cafe dashboard's lot card (see
// components/cafe/LotRatingBenchmarks.tsx): the anonymized top-2 shops for
// a lot (from public.checkins_cafe_benchmark_view — see
// supabase/migrations/0010_cafe_lot_benchmark_view.sql) plus this cafe's
// own average, computed here from the same public.checkins rows the
// "shop staff read own shop checkins" RLS policy already lets a
// cafe_admin/barista read in full (see 0007_staff_profiles_rls.sql).

export interface LotBenchmarkEntry {
  avgRating: number;
  reviewCount: number;
}

export interface LotBenchmark {
  top1: LotBenchmarkEntry | null;
  top2: LotBenchmarkEntry | null;
  ownShop: LotBenchmarkEntry | null;
}

// Best-effort, same as every other Supabase read in this app: an error
// here (RLS reject, view/migration not applied yet, offline) just means
// no benchmark data — the card renders its own "нет данных" state.
async function fetchAnonymizedTopShopsByLot(): Promise<Map<string, CheckinsCafeBenchmarkRow[]>> {
  const byLot = new Map<string, CheckinsCafeBenchmarkRow[]>();
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.from('checkins_cafe_benchmark_view').select('*');
    if (error || !data) return byLot;
    for (const row of data as CheckinsCafeBenchmarkRow[]) {
      const existing = byLot.get(row.lot_id) ?? [];
      existing.push(row);
      byLot.set(row.lot_id, existing);
    }
    return byLot;
  } catch {
    return byLot;
  }
}

async function fetchOwnShopRatingsByLot(shopId: string): Promise<Map<string, LotBenchmarkEntry>> {
  const byLot = new Map<string, LotBenchmarkEntry>();
  if (!shopId) return byLot;
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('checkins')
      .select('lot_id, rating')
      .eq('coffee_shop_id', shopId);
    if (error || !data) return byLot;
    const sums = new Map<string, { sum: number; count: number }>();
    for (const row of data as Pick<CheckinRow, 'lot_id' | 'rating'>[]) {
      const entry = sums.get(row.lot_id) ?? { sum: 0, count: 0 };
      entry.sum += row.rating;
      entry.count += 1;
      sums.set(row.lot_id, entry);
    }
    for (const [lotId, { sum, count }] of sums) {
      byLot.set(lotId, { avgRating: sum / count, reviewCount: count });
    }
    return byLot;
  } catch {
    return byLot;
  }
}

export async function fetchLotBenchmarksForShop(shopId: string): Promise<Map<string, LotBenchmark>> {
  const [topShopsByLot, ownShopByLot] = await Promise.all([
    fetchAnonymizedTopShopsByLot(),
    fetchOwnShopRatingsByLot(shopId),
  ]);

  const lotIds = new Set<string>([...topShopsByLot.keys(), ...ownShopByLot.keys()]);
  const result = new Map<string, LotBenchmark>();
  for (const lotId of lotIds) {
    const ranked = (topShopsByLot.get(lotId) ?? []).sort((a, b) => a.rank - b.rank);
    const top1Row = ranked.find((row) => row.rank === 1);
    const top2Row = ranked.find((row) => row.rank === 2);
    result.set(lotId, {
      top1: top1Row ? { avgRating: top1Row.avg_rating, reviewCount: top1Row.review_count } : null,
      top2: top2Row ? { avgRating: top2Row.avg_rating, reviewCount: top2Row.review_count } : null,
      ownShop: ownShopByLot.get(lotId) ?? null,
    });
  }
  return result;
}
