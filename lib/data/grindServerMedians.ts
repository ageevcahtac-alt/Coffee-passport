'use client';

// Server-side community aggregates for the grind converter (phase 3, 0038):
// the grind_conversion_medians view is anonymously readable (same tier as
// checkins_community_view) and carries no identity columns. Best-effort by
// design — offline or a not-yet-migrated table just yields an empty map,
// and estimateGrindSetting falls back to local confirmations, then the
// static reference table.
import { useEffect, useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import type { GrindConversionMedianRow } from '@/lib/types/database';

export interface ServerMedian {
  value: number;
  count: number;
}

export function medianKey(fromModel: string, toModel: string, brewingMethodId: string): string {
  return `${fromModel}|${toModel}|${brewingMethodId}`;
}

// Exported for lib/data/grindServerMedians.test.ts's mapping assertions —
// otherwise module-private, same convention as recordToRow in
// lib/journey/store.ts. The hook below is the only production caller.
export async function fetchGrindServerMedians(): Promise<Map<string, ServerMedian>> {
  const map = new Map<string, ServerMedian>();
  try {
    const { data, error } = await getBrowserSupabaseClient()
      .from('grind_conversion_medians')
      .select('*');
    if (error) {
      console.warn('[grind] medians fetch failed, local fallback stands:', error.message);
      return map;
    }
    for (const row of (data ?? []) as GrindConversionMedianRow[]) {
      if (row.median_to_setting === null || row.confirmations_count === 0) continue;
      map.set(medianKey(row.from_model, row.to_model, row.brewing_method), {
        value: row.median_to_setting,
        count: row.confirmations_count,
      });
    }
  } catch (err) {
    console.warn('[grind] medians fetch threw, local fallback stands:', err);
  }
  return map;
}

// One fetch per consumer mount; the view is tiny and this keeps the hook
// trivial. A later cache can dedupe across mounts without touching callers.
export function useGrindServerMedians(): Map<string, ServerMedian> {
  const [medians, setMedians] = useState<Map<string, ServerMedian>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void fetchGrindServerMedians().then((map) => {
      if (!cancelled) setMedians(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return medians;
}
