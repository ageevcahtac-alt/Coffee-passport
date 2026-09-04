'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { getMenuLotIds, syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { extractLotId } from '@/lib/utils/lotId';
import { QrScanner } from '@/components/coffee/QrScanner';

// No real "which cafe am I in" check-in flow yet — scoped to the pilot shop,
// same as the rest of the demo data in lib/data/ (see e.g. /dashboard/cafe).
const ACTIVE_SHOP_ID = 'shop-xo-vsevolozhsk';

// Validates the full chain before letting a guest into a lot's passport:
// the code must resolve to a real lot in the roaster catalog (useLots,
// merged across roasters), AND that lot must be on the current cafe's
// active menu (cafeMenuStore) — a code for a real lot the guest's shop
// doesn't actually serve is rejected just like an unknown code.
export function ScanLotModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const lots = useLots();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scannerFailed, setScannerFailed] = useState(false);

  // getMenuLotIds below reads the local cache synchronously (it's called
  // from a plain resolve function, not a hook, so it can't await this
  // itself) — kick the fetch off as early as possible, on mount, so the
  // cache is warm by the time a real scan/submit happens a beat later,
  // same best-effort pattern as syncEquipmentFromSupabase elsewhere.
  useEffect(() => {
    void syncCafeMenuFromSupabase(ACTIVE_SHOP_ID);
  }, []);

  function resolveAndNavigate(raw: string) {
    const lotId = extractLotId(raw);
    if (!lotId) return;

    const lot = lots.find((candidate) => candidate.id.toUpperCase() === lotId);
    if (!lot) {
      setError('Лот с таким кодом не найден у обжарщиков.');
      return;
    }

    const menuLotIds = getMenuLotIds(ACTIVE_SHOP_ID);
    if (!menuLotIds.includes(lot.id)) {
      setError('Этот лот пока не включён в меню кофейни — уточните у бариста.');
      return;
    }

    router.push(`/passport/${lot.id}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    resolveAndNavigate(code);
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
          <QrScanner onDecode={resolveAndNavigate} onError={() => setScannerFailed(true)} />
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
