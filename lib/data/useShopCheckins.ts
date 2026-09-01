'use client';

import { useEffect, useState } from 'react';
import type { TastingRecord } from '@/lib/types/coffee';
import { fetchShopCheckins } from './cafeShopCheckins';

// Read-only, no local cache/offline story needed (unlike journey/recipes/
// equipment) — this is the shop's own analytics read, not something the
// cafe/barista dashboards ever write back to, so a plain fetch-on-mount is
// enough. See lib/data/cafeShopCheckins.ts for why this exists instead of
// useJourney().
export function useShopCheckins(shopId: string): { records: TastingRecord[]; loading: boolean } {
  const [records, setRecords] = useState<TastingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchShopCheckins(shopId).then((data) => {
      if (cancelled) return;
      setRecords(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  return { records, loading };
}
