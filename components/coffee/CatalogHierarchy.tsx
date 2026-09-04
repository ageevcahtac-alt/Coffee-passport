'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ROAST_TYPE_LABELS, type Lot, type RoastType } from '@/lib/types/coffee';
import { normalizeCountryName } from '@/lib/utils/normalizeCountryName';

type Level = 'country' | 'roastType' | 'lots';

const ROAST_TYPE_ORDER: RoastType[] = ['filter', 'espresso', 'omni', 'alternative'];

// The shared 3-level catalog navigation used across all three cabinets —
// Country → Roast Profile → Lots — replacing the two independent, ad hoc
// country-only groupings that used to live inline in the roaster and cafe
// dashboards (identical `Map<country, Lot[]>`-building logic, written
// twice). This component owns the grouping/navigation chrome only; the
// actual lot card at level 3 is each caller's own (LotRow for the roaster,
// LotMenuCard for the cafe, GuestLotPreviewCard for the guest catalog) —
// passed in via `renderLot` rather than baked in here, since those cards
// carry surface-specific actions (catalog toggle, menu toggle, ...) this
// component has no business knowing about.
export function CatalogHierarchy({
  lots,
  renderLot,
  initialCountry = null,
  initialRoastType = null,
  emptyText = 'Пока нет лотов.',
}: {
  lots: Lot[];
  renderLot: (lot: Lot) => ReactNode;
  // Deep-link support — see components/coffee/BarUpdatesPanel.tsx, which
  // sends a guest straight to a specific country/roast-type list instead
  // of making them re-click through both levels.
  initialCountry?: string | null;
  initialRoastType?: RoastType | null;
  emptyText?: string;
}) {
  const countryGroups = useMemo(() => {
    const groups = new Map<string, Lot[]>();
    for (const lot of lots) {
      const key = normalizeCountryName(lot.country);
      const group = groups.get(key) ?? [];
      group.push(lot);
      groups.set(key, group);
    }
    return groups;
  }, [lots]);

  const sortedCountries = useMemo(
    () => Array.from(countryGroups.keys()).sort((a, b) => a.localeCompare(b, 'ru')),
    [countryGroups]
  );

  const normalizedInitialCountry = initialCountry ? normalizeCountryName(initialCountry) : null;
  const startsAtCountry = normalizedInitialCountry && countryGroups.has(normalizedInitialCountry);

  const [level, setLevel] = useState<Level>(startsAtCountry ? (initialRoastType ? 'lots' : 'roastType') : 'country');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(
    startsAtCountry ? normalizedInitialCountry : null
  );
  const [selectedRoastType, setSelectedRoastType] = useState<RoastType | null>(
    startsAtCountry ? initialRoastType : null
  );

  if (lots.length === 0) {
    return <p className="text-sm text-ink-400">{emptyText}</p>;
  }

  // ===== Level 1 — Country =====
  if (level === 'country' || !selectedCountry) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sortedCountries.map((country) => {
          const count = countryGroups.get(country)?.length ?? 0;
          return (
            <button
              key={country}
              type="button"
              onClick={() => {
                setSelectedCountry(country);
                setLevel('roastType');
              }}
              className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-5 text-left
                         hover:border-gold-400 transition-colors"
            >
              <p className="font-display text-base text-ink-900 leading-tight">{country}</p>
              <p className="data-value text-xs text-ink-400 mt-1">
                {count} {pluralizeLots(count)}
              </p>
            </button>
          );
        })}
      </div>
    );
  }

  const countryLots = countryGroups.get(selectedCountry) ?? [];

  // ===== Level 2 — Roast Profile =====
  if (level === 'roastType' || !selectedRoastType) {
    const roastGroups = new Map<RoastType, Lot[]>();
    for (const lot of countryLots) {
      const group = roastGroups.get(lot.roastType) ?? [];
      group.push(lot);
      roastGroups.set(lot.roastType, group);
    }
    const availableRoastTypes = ROAST_TYPE_ORDER.filter((type) => roastGroups.has(type));

    return (
      <div>
        <Breadcrumb
          segments={[{ label: selectedCountry, onClick: () => setLevel('country') }]}
        />
        <div className="grid grid-cols-2 gap-3 mt-4">
          {availableRoastTypes.map((roastType) => {
            const count = roastGroups.get(roastType)?.length ?? 0;
            return (
              <button
                key={roastType}
                type="button"
                onClick={() => {
                  setSelectedRoastType(roastType);
                  setLevel('lots');
                }}
                className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-5 text-left
                           hover:border-gold-400 transition-colors"
              >
                <p className="font-display text-base text-ink-900 leading-tight">
                  {ROAST_TYPE_LABELS[roastType]}
                </p>
                <p className="data-value text-xs text-ink-400 mt-1">
                  {count} {pluralizeLots(count)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== Level 3 — Lots =====
  const lotsForSelection = countryLots.filter((lot) => lot.roastType === selectedRoastType);

  return (
    <div>
      <Breadcrumb
        segments={[
          { label: selectedCountry, onClick: () => setLevel('country') },
          { label: ROAST_TYPE_LABELS[selectedRoastType], onClick: () => setLevel('roastType') },
        ]}
      />
      <div className="flex flex-col gap-4 mt-4">
        {lotsForSelection.map((lot) => (
          <div key={lot.id}>{renderLot(lot)}</div>
        ))}
      </div>
    </div>
  );
}

function Breadcrumb({ segments }: { segments: { label: string; onClick: () => void }[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1.5 text-sm">
      {segments.map((segment, index) => (
        <span key={segment.label} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-ink-300" aria-hidden="true">/</span>}
          <button
            type="button"
            onClick={segment.onClick}
            className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            {segment.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function pluralizeLots(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'лот';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'лота';
  return 'лотов';
}
