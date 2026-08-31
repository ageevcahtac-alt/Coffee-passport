'use client';

import { useEffect, useState } from 'react';
import { fetchAnonymizedCheckinsForRoaster, type AnonymizedCheckin } from './checkinsRoasterView';

// Read-only, no local cache/offline story needed (unlike journey/recipes/
// equipment) — this is aggregate analytics, not something the roaster
// dashboard ever writes back to, so a plain fetch-on-mount is enough.
export function useAnonymizedCheckins(): { checkins: AnonymizedCheckin[]; loading: boolean } {
  const [checkins, setCheckins] = useState<AnonymizedCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAnonymizedCheckinsForRoaster().then((data) => {
      if (cancelled) return;
      setCheckins(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { checkins, loading };
}
