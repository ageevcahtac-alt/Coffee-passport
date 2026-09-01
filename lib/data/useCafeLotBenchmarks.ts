'use client';

import { useEffect, useState } from 'react';
import { fetchLotBenchmarksForShop, type LotBenchmark } from './cafeLotBenchmarks';

// Read-only, no local cache/offline story needed (unlike journey/recipes/
// equipment) — this is aggregate analytics, not something the cafe
// dashboard ever writes back to, so a plain fetch-on-mount is enough. One
// fetch for the whole menu page rather than one per LotMenuCard.
export function useCafeLotBenchmarks(shopId: string): {
  benchmarks: Map<string, LotBenchmark>;
  loading: boolean;
} {
  const [benchmarks, setBenchmarks] = useState<Map<string, LotBenchmark>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLotBenchmarksForShop(shopId).then((data) => {
      if (cancelled) return;
      setBenchmarks(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  return { benchmarks, loading };
}
