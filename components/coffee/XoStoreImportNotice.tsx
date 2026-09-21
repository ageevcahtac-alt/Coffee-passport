'use client';

import { useEffect, useRef, useState } from 'react';
import { useLots } from '@/lib/data/useLots';
import { syncLotsFromSupabase } from '@/lib/data/lotsStore';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { addTastingRecord } from '@/lib/journey/store';
import { importXoStoreTasting, parseXoStoreFragment } from '@/lib/journey/xoStoreImport';

// Picks up the primary tasting XO COFFEE Store hands over in the URL
// fragment (format: lib/journey/xoStoreImport.ts), saves it once as an
// ordinary tasting for the current user, strips the fragment, and confirms.
// Renders nothing when the URL carries no handoff, or when the lot is
// unknown / the payload invalid (nothing is created in those cases).
export function XoStoreImportNotice({ lotId }: { lotId: string }) {
  const lots = useLots();
  const { userId, ready } = useCurrentUser();
  const [lotsSynced, setLotsSynced] = useState(false);
  const [saved, setSaved] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    void syncLotsFromSupabase(lotId).finally(() => setLotsSynced(true));
  }, [lotId]);

  const lot = lots.find((candidate) => candidate.id === lotId);

  useEffect(() => {
    if (handled.current || !ready || !userId || !lotsSynced) return;
    const result = parseXoStoreFragment(window.location.hash);
    if (result.status === 'none') {
      handled.current = true;
      return;
    }
    handled.current = true;
    // Drop the fragment whatever the outcome: it must not linger in the
    // address bar / history, and must not be re-processed on reload.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (result.status !== 'ok' || !lot) return;
    importXoStoreTasting(lot, result.tasting, userId, addTastingRecord);
    setSaved(true);
  }, [ready, userId, lotsSynced, lot]);

  if (!saved) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <div className="max-w-md mx-auto rounded-md border border-gold-400 bg-gold-50 px-4 py-3 shadow-sm flex items-start gap-3">
        <p className="flex-1 text-sm text-ink-700">Первичная оценка из XO COFFEE сохранена</p>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => setSaved(false)}
          className="text-ink-400 hover:text-ink-700 text-sm leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
