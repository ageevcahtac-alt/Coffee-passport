'use client';

import { useEffect, useState } from 'react';
import { FILTER_BREWING_METHODS, type BrewingMethodId } from '@/lib/types/coffee';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 focus:border-gold-400';

// Two-tier picker: the guest/author first chooses one of the two real-world
// brewing directions — Espresso or Filter — then, for Filter, a dropdown
// lets them narrow to a specific method (V60, Chemex, AeroPress, ... or
// "Свой способ" for anything not in the list). Both macro cards are
// symmetric one-click actions: picking either one immediately sets a
// concrete, complete brewingMethodId (Espresso → 'espresso', Filter →
// FILTER_BREWING_METHODS[0] as a starting default the dropdown can then
// refine) — Filter must NOT require a second click just to leave the
// "selected but still null" state, or it stops being a real toggle
// counterpart to Espresso. Callers reading the value (e.g. the Equipment
// Garage auto-fill in ProRecipeForm/EnthusiastRecipeForm) can react the
// moment either card is chosen.
//
// Strictly mutually exclusive, and each card toggles off on a second click
// (back to value = null / nothing selected): picking "Фильтр" while
// "Эспрессо" was selected must clear the old espresso value immediately —
// not just visually swap which card is open — otherwise the parent's
// brewingMethodId stays 'espresso' underneath an open filter dropdown and
// both cards render as checked at once.
export function BrewingMethodSelector({
  value,
  onChange,
  name = 'brewing-method',
}: {
  value: BrewingMethodId | null;
  onChange: (methodId: BrewingMethodId | null) => void;
  name?: string;
}) {
  const isEspresso = value === 'espresso';
  const isFilterValue = value !== null && value !== 'espresso';
  // Stays open once the guest picks "Фильтр", even before a specific method
  // is chosen — otherwise the dropdown would vanish the instant they open
  // it with nothing selected yet.
  const [filterOpen, setFilterOpen] = useState(isFilterValue);
  useEffect(() => {
    if (isFilterValue) setFilterOpen(true);
    if (value === null) setFilterOpen(false);
  }, [isFilterValue, value]);

  const filterActive = filterOpen || isFilterValue;

  function selectEspresso() {
    if (isEspresso) {
      onChange(null);
      return;
    }
    setFilterOpen(false);
    onChange('espresso');
  }

  function selectFilterCategory() {
    if (filterActive) {
      setFilterOpen(false);
      onChange(null);
      return;
    }
    // One click, same as Espresso: land on a concrete default method
    // (the dropdown below is for refining it, not for completing the
    // selection) rather than leaving brewingMethodId at null until a
    // second, separate interaction with the dropdown.
    setFilterOpen(true);
    onChange(FILTER_BREWING_METHODS[0].id);
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Способ приготовления" className="grid grid-cols-2 gap-3">
        <MacroCard label="☕ Эспрессо" checked={isEspresso} name={name} onClick={selectEspresso} />
        <MacroCard label="🧪 Фильтр" checked={filterActive} name={name} onClick={selectFilterCategory} />
      </div>

      {filterActive && (
        <div className="mt-3">
          <label htmlFor={`${name}-filter-method`} className="block text-xs text-ink-400 mb-1.5">
            Способ фильтра
          </label>
          <select
            id={`${name}-filter-method`}
            value={isFilterValue ? value : ''}
            onChange={(event) => onChange(event.target.value as BrewingMethodId)}
            className={fieldClasses}
          >
            <option value="" disabled>
              Выберите способ…
            </option>
            {FILTER_BREWING_METHODS.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function MacroCard({
  label,
  checked,
  name,
  onClick,
}: {
  label: string;
  checked: boolean;
  name: string;
  onClick: () => void;
}) {
  return (
    <label
      className={`flex items-center justify-center text-center rounded-md border
                  px-3 py-4 text-sm cursor-pointer transition-colors
                  ${checked
                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onClick} className="sr-only" />
      {label}
    </label>
  );
}
