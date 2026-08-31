'use client';

import { useEffect, useState } from 'react';
import { FILTER_BREWING_METHODS, type BrewingMethodId } from '@/lib/types/coffee';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 focus:border-gold-400';

// Two-tier picker: the guest/author first chooses one of the two real-world
// brewing directions — Espresso or Filter — then, only for Filter, a plain
// dropdown narrows to the specific method (V60, Chemex, AeroPress, ... or
// "Свой способ" for anything not in the list). Espresso needs no second
// step: picking the card fixes brewingMethodId = 'espresso' immediately, so
// callers reading it (e.g. the Equipment Garage auto-fill in
// ProRecipeForm/EnthusiastRecipeForm) can react the moment it's chosen.
export function BrewingMethodSelector({
  value,
  onChange,
  name = 'brewing-method',
}: {
  value: BrewingMethodId | null;
  onChange: (methodId: BrewingMethodId) => void;
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
  }, [isFilterValue]);

  return (
    <div>
      <div role="radiogroup" aria-label="Способ приготовления" className="grid grid-cols-2 gap-3">
        <MacroCard
          label="☕ Эспрессо"
          checked={isEspresso}
          name={name}
          onClick={() => {
            setFilterOpen(false);
            onChange('espresso');
          }}
        />
        <MacroCard
          label="🧪 Фильтр"
          checked={filterOpen || isFilterValue}
          name={name}
          onClick={() => setFilterOpen(true)}
        />
      </div>

      {(filterOpen || isFilterValue) && (
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
