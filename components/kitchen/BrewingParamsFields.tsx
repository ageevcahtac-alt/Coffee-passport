'use client';

import type { BrewingMethodId } from '@/lib/types/coffee';
import { HOME_GRINDER_MODELS } from '@/lib/types/coffee';
import { ComboSelect } from '@/components/shared/ComboSelect';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';

// Every brewing-parameter field shared by "Мои рецепты" (KitchenRecipeForm)
// and "Мой кофе"'s cupping evaluation (CustomCoffeeCuppingForm) — extracted
// so the two forms can't quietly drift apart on the same fields. Number
// inputs stay string-typed here (converted at the caller's submit time),
// matching this app's usual controlled-form idiom.
export interface BrewingParamsValues {
  brewingMethod: BrewingMethodId | null;
  grinderModel: string;
  doseG: string;
  waterG: string;
  waterTempC: string;
  waterMineralization: string;
  grindSetting: string;
  brewTimeSec: string;
  preInfusionSec: string;
}

export function emptyBrewingParams(): BrewingParamsValues {
  return {
    brewingMethod: null,
    grinderModel: '',
    doseG: '',
    waterG: '',
    waterTempC: '',
    waterMineralization: '',
    grindSetting: '',
    brewTimeSec: '',
    preInfusionSec: '',
  };
}

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export function BrewingParamsFields({
  value,
  onChange,
  idPrefix,
}: {
  value: BrewingParamsValues;
  onChange: (next: BrewingParamsValues) => void;
  idPrefix: string;
}) {
  function set<K extends keyof BrewingParamsValues>(key: K, val: BrewingParamsValues[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <>
      <div>
        <p className="section-label mb-4">Способ заваривания</p>
        <BrewingMethodSelector
          value={value.brewingMethod}
          onChange={(method) => set('brewingMethod', method)}
          name={`${idPrefix}-method`}
        />
      </div>

      <ComboSelect
        label="Кофемолка"
        options={HOME_GRINDER_MODELS}
        value={value.grinderModel}
        onChange={(v) => set('grinderModel', v)}
      />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-dose`} className="block text-xs text-ink-400 mb-1.5">
              Закладка кофе, г
            </label>
            <input
              id={`${idPrefix}-dose`}
              type="number"
              min="0"
              step="0.1"
              value={value.doseG}
              onChange={(e) => set('doseG', e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-water`} className="block text-xs text-ink-400 mb-1.5">
              Вода, мл/г
            </label>
            <input
              id={`${idPrefix}-water`}
              type="number"
              min="0"
              step="1"
              value={value.waterG}
              onChange={(e) => set('waterG', e.target.value)}
              className={fieldClasses}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-temp`} className="block text-xs text-ink-400 mb-1.5">
              Температура воды, °C
            </label>
            <input
              id={`${idPrefix}-temp`}
              type="number"
              min="0"
              step="1"
              value={value.waterTempC}
              onChange={(e) => set('waterTempC', e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-grind`} className="block text-xs text-ink-400 mb-1.5">
              Помол (щелчки / микроны)
            </label>
            <input
              id={`${idPrefix}-grind`}
              value={value.grindSetting}
              onChange={(e) => set('grindSetting', e.target.value)}
              placeholder="Comandante клик 24"
              className={fieldClasses}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-mineral`} className="block text-xs text-ink-400 mb-1.5">
            Профиль / минерализация воды
          </label>
          <input
            id={`${idPrefix}-mineral`}
            value={value.waterMineralization}
            onChange={(e) => set('waterMineralization', e.target.value)}
            placeholder="Third Wave Water Classic, ~150 ppm"
            className={fieldClasses}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-brewtime`} className="block text-xs text-ink-400 mb-1.5">
              Время экстракции, сек
            </label>
            <input
              id={`${idPrefix}-brewtime`}
              type="number"
              min="0"
              step="1"
              value={value.brewTimeSec}
              onChange={(e) => set('brewTimeSec', e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-preinfusion`} className="block text-xs text-ink-400 mb-1.5">
              Предсмачивание, сек
            </label>
            <input
              id={`${idPrefix}-preinfusion`}
              type="number"
              min="0"
              step="1"
              value={value.preInfusionSec}
              onChange={(e) => set('preInfusionSec', e.target.value)}
              className={fieldClasses}
            />
          </div>
        </div>
      </div>
    </>
  );
}
