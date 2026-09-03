'use client';

import { useEffect } from 'react';
import type { Lot, TastingRecord } from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getRoasterById } from '@/lib/data/roasters';
import { formatTastingDate } from '@/lib/utils/date';
import { ProducerRoasterCard } from './ProducerRoasterCard';
import { TasteComparison } from './TasteComparison';
import { TastingRecordDetails } from './TastingRecordDetails';
import { ProfileCompareCarousel, type ComparePanel } from './ProfileCompareCarousel';

// "Моя оценка" panel content — the FULL tasting record exactly as the guest
// filled it out during the blind-cupping flow (same TastingRecordDetails
// used by TastingDetailModal, not a re-summarized cut-down version), plus —
// when this lot was checked in more than once — every other coffee
// shop/date to switch the inline detail to, or open that record's own full
// modal. This modal is only ever opened for a lot the guest has already
// tasted (see LotPassportModal below), so there is no "not tasted yet"
// state to design for here — no call-to-action, no navigation to start a
// new tasting, purely read-only.
function MyRatingPanel({
  records,
  onOpenRecord,
}: {
  records: TastingRecord[]; // sorted newest-first, guaranteed non-empty by LotPassportModal
  onOpenRecord: (record: TastingRecord) => void;
}) {
  const latest = records[0];

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <TastingRecordDetails record={latest} />

      {records.length > 1 && (
        <div className="mt-6 pt-5 border-t border-ink-200">
          <p className="section-label mb-2">Другие кофейни и даты ({records.length})</p>
          <ul className="flex flex-col gap-1.5">
            {records.map((record) => {
              const shop = getCoffeeShopById(record.coffeeShopId);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecord(record)}
                    className="w-full flex items-center justify-between gap-3 text-left
                               text-sm text-ink-700 hover:text-ink-900"
                  >
                    <span>
                      {shop?.name ?? record.coffeeShopId}
                      {shop?.city ? ` · ${shop.city}` : ''}
                    </span>
                    <span className="data-value text-xs text-ink-400 shrink-0">
                      {formatTastingDate(record.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Read-only lot passport reached from "Открыть паспорт лота →" in
// CoffeeJourney (Моё кофейное путешествие) — always for a lot the guest has
// already checked in and tasted at least once (CoffeeJourney only ever
// offers this action from an already-expanded, already-tasted lot; see its
// own lotRecords derivation). Deliberately NOT a navigation to
// /passport/[lotId]: that route's whole job is the check-in flow (shop
// picker → BlindTastingLock → reveal) for STARTING a new tasting, which has
// no place in a read-only "here's what you already saved" view.
//
// "Профиль обжарщика" / "Моя оценка" / "Сравнить" are laid out as one
// swipeable filmstrip (see ProfileCompareCarousel) instead of a long
// vertical stack, so the two profiles read as a single side-by-side
// comparison rather than two unrelated sections.
export function LotPassportModal({
  lot,
  records,
  onClose,
  onOpenRecord,
}: {
  lot: Lot;
  records: TastingRecord[]; // this guest's own records for this lot, any coffee shop — must be non-empty
  onClose: () => void;
  onOpenRecord: (record: TastingRecord) => void;
}) {
  const roaster = getRoasterById(lot.roasterId);
  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Guards a caller that (incorrectly) opens this for an untasted lot —
  // there is nothing read-only to show without at least one record, and no
  // call-to-action here to fill that gap by design (see module comment).
  if (sortedRecords.length === 0) return null;
  const latestRecord = sortedRecords[0];

  const panels: ComparePanel[] = [
    { id: 'roaster', label: 'Профиль обжарщика', content: <ProducerRoasterCard lot={lot} /> },
    {
      id: 'mine',
      label: 'Моя оценка',
      content: <MyRatingPanel records={sortedRecords} onOpenRecord={onOpenRecord} />,
    },
    {
      id: 'compare',
      label: 'Сравнить',
      content: <TasteComparison lot={lot} tasting={latestRecord} />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${lot.name} — паспорт лота`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="font-display text-2xl text-ink-900 leading-tight">{lot.name}</h2>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
              {roaster?.name ?? 'Обжарщик'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-ink-300 mb-6">
          Эталонный профиль обжарщика и ваш личный опыт — листайте свайпом или переключайте вкладками
        </p>

        <ProfileCompareCarousel panels={panels} />
      </div>
    </div>
  );
}
