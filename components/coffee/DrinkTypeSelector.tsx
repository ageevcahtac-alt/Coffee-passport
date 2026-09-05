'use client';

import {
  DRINK_CATEGORIES,
  DRINK_TYPES_BY_CATEGORY,
  type DrinkCategory,
  type DrinkSelectionDraft,
} from '@/lib/types/coffee';
import { MilkBaseSelector } from './MilkBaseSelector';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Level 1 (drink category) + Level 2 (specific drink / brew method, plus the
// milk decision tree for milk-based drinks) of the guest's pre-tasting
// pick — see lib/types/coffee.ts's DrinkSelection/DrinkSelectionDraft for
// the shape this fills in before the parent flow can move on to the
// (still-blind) taste assessment.
export function DrinkTypeSelector({
  value,
  onChange,
}: {
  value: DrinkSelectionDraft;
  onChange: (patch: Partial<DrinkSelectionDraft>) => void;
}) {
  const drinkTypes = value.drinkCategory ? DRINK_TYPES_BY_CATEGORY[value.drinkCategory] : [];
  const selectedType = drinkTypes.find((type) => type.id === value.drinkType);

  function selectCategory(category: DrinkCategory) {
    if (value.drinkCategory === category) return;
    onChange({
      drinkCategory: category,
      drinkType: '',
      customDrinkName: '',
      milkBaseType: null,
      cowMilkType: null,
      isLactoseFree: false,
      fatContentPercent: null,
      plantMilkType: null,
    });
  }

  function selectDrinkType(id: string) {
    onChange({ drinkType: id, customDrinkName: id === 'custom' ? value.customDrinkName : '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="section-label mb-4">Что вы пьёте?</p>
        <div role="radiogroup" aria-label="Категория напитка" className="flex flex-col gap-3">
          {DRINK_CATEGORIES.map((category) => (
            <CategoryCard
              key={category.id}
              label={category.label}
              checked={value.drinkCategory === category.id}
              onClick={() => selectCategory(category.id)}
            />
          ))}
        </div>
      </div>

      {value.drinkCategory && (
        <div className="reveal-fade">
          <p className="section-label mb-4">
            {value.drinkCategory === 'filter_alternative' ? 'Способ заваривания' : 'Напиток'}
          </p>
          <div className="flex flex-wrap gap-2">
            {drinkTypes.map((type) => {
              const active = value.drinkType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => selectDrinkType(type.id)}
                  aria-pressed={active}
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors
                              ${active
                                ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                : 'border-ink-200 bg-parchment-200 text-ink-500'}`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>
          {selectedType?.hint && <p className="text-xs text-ink-400 mt-2">{selectedType.hint}</p>}
          {value.drinkType === 'custom' && (
            <input
              type="text"
              value={value.customDrinkName}
              onChange={(event) => onChange({ customDrinkName: event.target.value })}
              placeholder={
                value.drinkCategory === 'filter_alternative' ? 'Например, гейзерная кофеварка' : 'Название напитка'
              }
              className={`${fieldClasses} mt-3`}
            />
          )}
        </div>
      )}

      {value.drinkCategory === 'milk_based' && value.drinkType && (
        <div className="reveal-fade">
          <p className="section-label mb-4">Молоко</p>
          <MilkBaseSelector value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function CategoryCard({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex items-center rounded-md border px-4 py-4 text-sm text-left transition-colors
                  ${checked
                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
    >
      {label}
    </button>
  );
}
