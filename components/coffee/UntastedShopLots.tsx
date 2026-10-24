import Link from 'next/link';

export interface UntastedShopLot {
  lotId: string;
  lotName: string;
  roasterName: string;
}

// Deferred cupping: lots opened from the store path and not tasted yet (see
// lib/journey/shopLotsStore.ts). "Пройти каппинг" goes into the blind path —
// ?entry=cafe skips the store/cafe choice and opens the shop pick.
export function UntastedShopLots({ lots }: { lots: UntastedShopLot[] }) {
  if (lots.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {lots.map((lot) => (
        <div key={lot.lotId} className="rounded-md border border-ink-200 bg-parchment-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-medium text-ink-900 leading-tight">{lot.lotName}</p>
              <p className="text-xs text-ink-400 mt-0.5">{lot.roasterName}</p>
            </div>
            <span className="shrink-0 rounded-full border border-ink-200 px-2.5 py-1 text-[11px] text-ink-500">
              Не попробован
            </span>
          </div>
          <Link
            href={`/passport/${lot.lotId}?entry=cafe`}
            className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-3
                       hover:bg-ink-800 transition-colors"
          >
            Пройти каппинг
          </Link>
        </div>
      ))}
    </div>
  );
}
