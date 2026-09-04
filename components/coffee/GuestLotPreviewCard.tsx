import Link from 'next/link';
import { LOT_MENU_STATUS_LABELS, ROAST_TYPE_LABELS, type Lot, type LotMenuStatus } from '@/lib/types/coffee';

const STATUS_ACCENT_CLASSES: Record<LotMenuStatus, string> = {
  new: 'border-moss-500 bg-moss-100 text-moss-700',
  active: '',
  discontinuing: 'border-scorch bg-scorch/10 text-scorch',
};

// The guest-facing, read-only lot card for the 3-level catalog
// (components/coffee/CatalogHierarchy.tsx) — the one card in this feature
// that follows the literal title standard from the product spec:
// "[Страна] [Регион / Ферма / Название]".
export function GuestLotPreviewCard({ lot, status }: { lot: Lot; status: LotMenuStatus }) {
  const title = [lot.country, lot.region || lot.name].filter(Boolean).join(' ');

  return (
    <Link
      href={`/passport/${lot.id}`}
      className="block rounded-md border border-ink-200 bg-parchment-100 p-5 hover:border-gold-400 transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="font-display text-lg text-ink-900 leading-tight">{title}</h3>
        <span className="data-value text-sm text-gold-500 shrink-0">{lot.qGrade.toFixed(1)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full border border-gold-400 text-gold-500 text-[11px]
                     uppercase tracking-widest2 px-2.5 py-1"
        >
          {ROAST_TYPE_LABELS[lot.roastType]}
        </span>
        {status !== 'active' && (
          <span
            className={`rounded-full border text-[11px] uppercase tracking-widest2 px-2.5 py-1 ${STATUS_ACCENT_CLASSES[status]}`}
          >
            {LOT_MENU_STATUS_LABELS[status]}
          </span>
        )}
      </div>
    </Link>
  );
}
