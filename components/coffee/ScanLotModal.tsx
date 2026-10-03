'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getMergedLotById, syncLotsFromSupabase } from '@/lib/data/lotsStore';
import { getMenuLotIds, syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { extractLotId } from '@/lib/utils/lotId';
import { QrScanner } from '@/components/coffee/QrScanner';

// No real "which cafe am I in" check-in flow yet — scoped to the pilot shop,
// same as the rest of the demo data in lib/data/ (see e.g. /dashboard/cafe).
const ACTIVE_SHOP_ID = 'shop-xo-vsevolozhsk';

// Validates the full chain before letting a guest into a lot's passport:
// Known catalog lots must be on the pilot cafe's active menu. Unknown
// local ids are delegated to the passport's scoped fetch rather than
// rejected against a possibly incomplete/offline cache.
export function ScanLotModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scannerFailed, setScannerFailed] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const syncRef = useRef<Promise<unknown> | null>(null);
  const resolvingRef = useRef(false);

  // Start both reads together, but wait for them before checking the menu.
  // The decode callback then reads today's snapshot rather than closing
  // over the initial render's seed-only array.
  useEffect(() => {
    syncRef.current = Promise.all([
      syncLotsFromSupabase(),
      syncCafeMenuFromSupabase(ACTIVE_SHOP_ID),
    ]);
  }, []);

  async function resolveAndNavigate(raw: string) {
    const lotId = extractLotId(raw);
    if (!lotId) {
      setError('Не удалось прочитать код лота. Попробуйте ещё раз.');
      return;
    }
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      await syncRef.current;
      const lot = getMergedLotById(lotId);
      // Offline/unknown local rows are delegated to the passport's own
      // scoped fetch instead of presenting a false "not found" here.
      if (lot && !getMenuLotIds(ACTIVE_SHOP_ID).includes(lot.id)) {
        setError('Этот лот пока не включён в меню кофейни — уточните у бариста.');
        return;
      }
      router.push(`/passport/${lot?.id ?? lotId}`);
    } finally {
      resolvingRef.current = false;
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void resolveAndNavigate(code);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Отсканировать лот"
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="font-display text-xl text-ink-900">Отсканировать лот</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <QrScanner onDecode={resolveAndNavigate} onError={() => setScannerFailed(true)} resetKey={scannerResetKey} />
          {error && !scannerFailed && (
            <button type="button" onClick={() => { setError(''); setScannerResetKey((key) => key + 1); }}
              className="text-sm text-ink-700 underline mt-3">
              Сканировать ещё раз
            </button>
          )}
        </div>
        <p className="text-xs text-ink-400 mb-4">
          {scannerFailed
            ? 'Введите код лота с этикетки вручную.'
            : 'Наведите камеру на QR-код на пачке — сработает автоматически.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="LOT-XO-COL-004"
              className="flex-1 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3
                         text-sm data-value text-ink-900 placeholder:text-ink-300
                         focus:border-gold-400"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-sm px-5
                         hover:bg-ink-800 transition-colors
                         disabled:opacity-40 disabled:pointer-events-none"
            >
              Открыть
            </button>
          </div>
          {error && <p className="text-xs text-ink-500 mt-2">⚠ {error}</p>}
        </form>
      </div>
    </div>
  );
}
