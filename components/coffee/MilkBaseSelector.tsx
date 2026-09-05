'use client';

import {
  COW_MILK_FAT_PRESETS,
  COW_MILK_TYPE_LABELS,
  PLANT_MILK_TYPES,
  type CowMilkType,
  type DrinkSelection,
  type MilkBaseType,
} from '@/lib/types/coffee';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const PLANT_PRESET_IDS: string[] = PLANT_MILK_TYPES.map((option) => option.id);

type MilkFields = Pick<
  DrinkSelection,
  'milkBaseType' | 'cowMilkType' | 'isLactoseFree' | 'fatContentPercent' | 'plantMilkType'
>;

// Level-2 decision tree for the "Напитки с молоком" category — type of milk
// first (cow vs. plant), then branch-specific detail, mirroring the order a
// barista would actually ask. Lives one level below DrinkTypeSelector, which
// owns the surrounding DrinkSelection object and only renders this once a
// milk-based drink has been picked.
export function MilkBaseSelector({
  value,
  onChange,
}: {
  value: MilkFields;
  onChange: (patch: Partial<MilkFields>) => void;
}) {
  const isPlantCustomActive =
    value.milkBaseType === 'plant' &&
    value.plantMilkType !== null &&
    !PLANT_PRESET_IDS.includes(value.plantMilkType);

  function selectMilkBase(base: MilkBaseType) {
    if (value.milkBaseType === base) return;
    onChange({
      milkBaseType: base,
      cowMilkType: null,
      isLactoseFree: false,
      fatContentPercent: null,
      plantMilkType: null,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs text-ink-400 mb-2">Тип молока</p>
        <div role="radiogroup" aria-label="Тип молока" className="grid grid-cols-2 gap-3">
          <MilkBaseCard label="🐄 Коровье" checked={value.milkBaseType === 'cow'} onClick={() => selectMilkBase('cow')} />
          <MilkBaseCard
            label="🌱 Растительное / Альтернативное"
            checked={value.milkBaseType === 'plant'}
            onClick={() => selectMilkBase('plant')}
          />
        </div>
      </div>

      {value.milkBaseType === 'cow' && (
        <div className="flex flex-col gap-4 reveal-fade">
          <div>
            <p className="text-xs text-ink-400 mb-2">Вид молока</p>
            <div role="radiogroup" aria-label="Вид коровьего молока" className="grid grid-cols-2 gap-3">
              {(Object.keys(COW_MILK_TYPE_LABELS) as CowMilkType[]).map((id) => (
                <MilkBaseCard
                  key={id}
                  label={COW_MILK_TYPE_LABELS[id]}
                  checked={value.cowMilkType === id}
                  onClick={() => onChange({ cowMilkType: id })}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={value.isLactoseFree}
              onChange={(event) => onChange({ isLactoseFree: event.target.checked })}
              className="h-4 w-4 accent-current text-gold-500"
            />
            <span className="text-sm text-ink-700">Безлактозное</span>
          </label>

          <div>
            <p className="text-xs text-ink-400 mb-2">Жирность, %</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {COW_MILK_FAT_PRESETS.map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => onChange({ fatContentPercent: percent })}
                  aria-pressed={value.fatContentPercent === percent}
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors
                              ${value.fatContentPercent === percent
                                ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                : 'border-ink-200 bg-parchment-200 text-ink-500'}`}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <input
              type="number"
              step={0.1}
              min={0}
              max={100}
              value={value.fatContentPercent ?? ''}
              onChange={(event) =>
                onChange({ fatContentPercent: event.target.value === '' ? null : Number(event.target.value) })
              }
              placeholder="Другое значение, %"
              className={fieldClasses}
            />
          </div>
        </div>
      )}

      {value.milkBaseType === 'plant' && (
        <div className="reveal-fade">
          <p className="text-xs text-ink-400 mb-2">Вид молока</p>
          <div className="flex flex-wrap gap-2">
            {PLANT_MILK_TYPES.map((option) => {
              const active = option.id === 'custom' ? isPlantCustomActive : value.plantMilkType === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ plantMilkType: option.id === 'custom' ? '' : option.id })}
                  aria-pressed={active}
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors
                              ${active
                                ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                : 'border-ink-200 bg-parchment-200 text-ink-500'}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {(value.plantMilkType === '' || isPlantCustomActive) && (
            <input
              type="text"
              value={isPlantCustomActive ? value.plantMilkType ?? '' : ''}
              onChange={(event) => onChange({ plantMilkType: event.target.value })}
              placeholder="Например, рисовое"
              className={`${fieldClasses} mt-2`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MilkBaseCard({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex items-center justify-center text-center rounded-md border
                  px-3 py-4 text-sm transition-colors
                  ${checked
                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
    >
      {label}
    </button>
  );
}
