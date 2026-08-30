'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { BrewingMethodId, BrewingRecipe, Lot, RecipeAuthorType } from '@/lib/types/coffee';
import { ESPRESSO_MACHINE_MODELS } from '@/lib/types/coffee';
import { useEquipment } from '@/lib/data/useEquipment';
import { useCustomDevices } from '@/lib/data/useCustomDevices';
import { buildFilterDeviceCatalog } from '@/lib/utils/filterDeviceCatalog';
import { ComboSelect } from '@/components/shared/ComboSelect';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

type RecipeInput = Omit<BrewingRecipe, 'id' | 'createdAt'>;

interface FormState {
  brewingMethodId: BrewingMethodId | null;
  doseG: string;
  yieldG: string;
  measuredTds: string;
  grinderModel: string;
  grinderSetting: string;
  waterTempC: string;
  waterBrand: string;
  waterTds: string;
  waterCustomMineralization: string;
  bloomTimeSec: string;
  preInfusionSec: string;
  flowRateGPerSec: string;
  totalTimeSec: string;
  equipmentModel: string;
  pressureBar: string;
  pressureProfile: string;
  notes: string;
}

function toFormState(recipe?: BrewingRecipe): FormState {
  return {
    brewingMethodId: recipe?.brewingMethodId ?? null,
    doseG: recipe ? String(recipe.doseG) : '',
    yieldG: recipe ? String(recipe.yieldG) : '',
    measuredTds: recipe?.measuredTdsPercent !== null && recipe?.measuredTdsPercent !== undefined ? String(recipe.measuredTdsPercent) : '',
    grinderModel: recipe?.grinderModel ?? '',
    grinderSetting: recipe?.grinderSetting ?? '',
    waterTempC: recipe ? String(recipe.waterTempC) : '',
    waterBrand: recipe?.waterBrand ?? '',
    waterTds: recipe?.waterTds !== null && recipe?.waterTds !== undefined ? String(recipe.waterTds) : '',
    waterCustomMineralization: recipe?.waterCustomMineralization ?? '',
    bloomTimeSec: recipe?.bloomTimeSec !== null && recipe?.bloomTimeSec !== undefined ? String(recipe.bloomTimeSec) : '',
    preInfusionSec: recipe?.preInfusionSec !== null && recipe?.preInfusionSec !== undefined ? String(recipe.preInfusionSec) : '',
    flowRateGPerSec: recipe?.flowRateGPerSec !== null && recipe?.flowRateGPerSec !== undefined ? String(recipe.flowRateGPerSec) : '',
    totalTimeSec: recipe ? String(recipe.totalTimeSec) : '',
    equipmentModel: recipe?.equipmentModel ?? '',
    pressureBar: recipe?.pressureBar !== null && recipe?.pressureBar !== undefined ? String(recipe.pressureBar) : '',
    pressureProfile: recipe?.pressureProfile ?? '',
    notes: recipe?.notes ?? '',
  };
}

// Shared engine behind BenchmarkRecipeForm (roaster) and SignatureRecipeForm
// (coffee shop) — same hyper-precise pro field set (microns, TDS, bar
// pressure, commercial burr/machine models), differing only in who's
// authoring and which suggestion lists apply.
export function ProRecipeForm({
  lot,
  authorType,
  authorId,
  authorName,
  isBenchmark,
  grinderOptions,
  initialRecipe,
  onSave,
  onCancel,
}: {
  lot: Lot;
  authorType: RecipeAuthorType;
  authorId: string;
  authorName: string;
  isBenchmark: boolean;
  grinderOptions: string[];
  initialRecipe?: BrewingRecipe;
  onSave: (recipe: RecipeInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialRecipe));
  const myEquipment = useEquipment().find((setup) => setup.userId === authorId);
  const approvedCustomDevices = useCustomDevices().filter((device) => device.approved);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isEspresso = form.brewingMethodId === 'espresso';
  const filterDeviceCatalog = useMemo(
    () => buildFilterDeviceCatalog(approvedCustomDevices, myEquipment?.favoriteDeviceIds ?? []),
    [approvedCustomDevices, myEquipment]
  );

  // Auto-fill from the Roaster's/Coffee Shop's own Equipment Garage setup
  // (see components/coffee/EquipmentGarage.tsx, keyed by this recipe's
  // authorId — the roasterId or coffee-shop id) whenever the brewing
  // method changes. Same "only fill empty fields" rule as
  // EnthusiastRecipeForm, so it never overwrites an edit-in-progress.
  useEffect(() => {
    if (!form.brewingMethodId || !myEquipment) return;
    const grinder = isEspresso ? myEquipment.espressoGrinder : myEquipment.filterGrinder;
    const water = isEspresso ? myEquipment.espressoWater : myEquipment.filterWater;

    setForm((prev) => ({
      ...prev,
      grinderModel: prev.grinderModel || grinder,
      equipmentModel: isEspresso ? prev.equipmentModel || myEquipment.espressoMachine : prev.equipmentModel,
      waterCustomMineralization: prev.waterCustomMineralization || water,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the method changes, not on every equipment/form update
  }, [form.brewingMethodId]);

  const canSave = Boolean(form.brewingMethodId && form.doseG && form.yieldG);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.brewingMethodId || !canSave) return;

    const recipe: RecipeInput = {
      lotId: lot.id,
      brewingMethodId: form.brewingMethodId,
      authorType,
      authorId,
      authorName,
      isBenchmark,
      parentRecipeId: null,
      doseG: Number(form.doseG),
      yieldG: Number(form.yieldG),
      measuredTdsPercent: form.measuredTds ? Number(form.measuredTds) : null,
      grinderModel: form.grinderModel.trim(),
      grinderSetting: form.grinderSetting.trim(),
      waterTempC: Number(form.waterTempC) || 0,
      waterBrand: form.waterBrand.trim(),
      waterTds: form.waterTds ? Number(form.waterTds) : null,
      waterCustomMineralization: form.waterCustomMineralization.trim(),
      bloomTimeSec: form.bloomTimeSec ? Number(form.bloomTimeSec) : null,
      preInfusionSec: form.preInfusionSec ? Number(form.preInfusionSec) : null,
      flowRateGPerSec: form.flowRateGPerSec ? Number(form.flowRateGPerSec) : null,
      totalTimeSec: Number(form.totalTimeSec) || 0,
      equipmentModel: form.equipmentModel.trim(),
      pressureBar: isEspresso && form.pressureBar ? Number(form.pressureBar) : null,
      pressureProfile: isEspresso ? form.pressureProfile.trim() : '',
      notes: form.notes.trim(),
      isPublic: true, // roaster/coffee_shop recipes are always public by nature
    };

    onSave(recipe);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <p className="section-label mb-4">Способ приготовления</p>
        <BrewingMethodSelector value={form.brewingMethodId} onChange={(id) => update('brewingMethodId', id)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pr-dose" className="block text-xs text-ink-400 mb-1.5">Доза, г</label>
          <input id="pr-dose" type="number" step="0.1" value={form.doseG}
            onChange={(e) => update('doseG', e.target.value)} required className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="pr-yield" className="block text-xs text-ink-400 mb-1.5">Выход, г/мл</label>
          <input id="pr-yield" type="number" step="0.1" value={form.yieldG}
            onChange={(e) => update('yieldG', e.target.value)} required className={fieldClasses} />
        </div>
      </div>

      <div>
        <label htmlFor="pr-measured-tds" className="block text-xs text-ink-400 mb-1.5">
          TDS чашки, % (рефрактометр) — необязательно
        </label>
        <input id="pr-measured-tds" type="number" step="0.01" min="0" value={form.measuredTds}
          onChange={(e) => update('measuredTds', e.target.value)} placeholder="1.35" className={fieldClasses} />
        <p className="text-xs text-ink-300 mt-1.5">
          Крепость сваренной чашки — не путать с TDS воды ниже. Включает график экстракции на карточке рецепта.
        </p>
      </div>

      <ComboSelect label="Кофемолка" options={grinderOptions} value={form.grinderModel}
        onChange={(v) => update('grinderModel', v)} />
      <div>
        <label htmlFor="pr-setting" className="block text-xs text-ink-400 mb-1.5">
          Настройка помола (клики / деление / микроны)
        </label>
        <input id="pr-setting" value={form.grinderSetting} onChange={(e) => update('grinderSetting', e.target.value)}
          placeholder="750 микрон" className={fieldClasses} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pr-temp" className="block text-xs text-ink-400 mb-1.5">Температура воды, °C</label>
          <input id="pr-temp" type="number" value={form.waterTempC} onChange={(e) => update('waterTempC', e.target.value)}
            className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="pr-tds" className="block text-xs text-ink-400 mb-1.5">TDS воды, ppm</label>
          <input id="pr-tds" type="number" value={form.waterTds} onChange={(e) => update('waterTds', e.target.value)}
            className={fieldClasses} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pr-waterbrand" className="block text-xs text-ink-400 mb-1.5">Бренд воды</label>
          <input id="pr-waterbrand" value={form.waterBrand} onChange={(e) => update('waterBrand', e.target.value)}
            className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="pr-minerals" className="block text-xs text-ink-400 mb-1.5">Ca/Mg рецепт минерализации</label>
          <input id="pr-minerals" value={form.waterCustomMineralization} onChange={(e) => update('waterCustomMineralization', e.target.value)}
            placeholder="Ca 60 / Mg 15 ppm" className={fieldClasses} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="pr-bloom" className="block text-xs text-ink-400 mb-1.5">Блум, сек</label>
          <input id="pr-bloom" type="number" value={form.bloomTimeSec} onChange={(e) => update('bloomTimeSec', e.target.value)}
            className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="pr-preinf" className="block text-xs text-ink-400 mb-1.5">Пре-инфузия, сек</label>
          <input id="pr-preinf" type="number" value={form.preInfusionSec} onChange={(e) => update('preInfusionSec', e.target.value)}
            className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="pr-time" className="block text-xs text-ink-400 mb-1.5">Общее время, сек</label>
          <input id="pr-time" type="number" value={form.totalTimeSec} onChange={(e) => update('totalTimeSec', e.target.value)}
            className={fieldClasses} />
        </div>
      </div>
      <div>
        <label htmlFor="pr-flow" className="block text-xs text-ink-400 mb-1.5">Скорость потока, г/сек</label>
        <input id="pr-flow" type="number" step="0.1" value={form.flowRateGPerSec} onChange={(e) => update('flowRateGPerSec', e.target.value)}
          className={fieldClasses} />
      </div>

      {form.brewingMethodId && (
        isEspresso ? (
          <ComboSelect label="Эспрессо-машина" options={ESPRESSO_MACHINE_MODELS} value={form.equipmentModel}
            onChange={(v) => update('equipmentModel', v)} />
        ) : (
          <ComboSelect
            label="Устройство для фильтра"
            options={filterDeviceCatalog.options}
            priorityOptions={filterDeviceCatalog.priorityOptions}
            value={form.equipmentModel}
            onChange={(v) => update('equipmentModel', v)}
          />
        )
      )}

      {isEspresso && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pr-pressure" className="block text-xs text-ink-400 mb-1.5">Давление, bar</label>
            <input id="pr-pressure" type="number" step="0.1" value={form.pressureBar} onChange={(e) => update('pressureBar', e.target.value)}
              className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="pr-profile" className="block text-xs text-ink-400 mb-1.5">Профиль давления</label>
            <input id="pr-profile" value={form.pressureProfile} onChange={(e) => update('pressureProfile', e.target.value)}
              placeholder="Ramp 6→9 bar за 10с" className={fieldClasses} />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="pr-notes" className="section-label mb-4 block">Заметки автора и ожидаемый вкус</label>
        <textarea id="pr-notes" rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)}
          className={fieldClasses} />
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors">
            Отмена
          </button>
        )}
        <button type="submit" disabled={!canSave}
          className="flex-1 inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          {initialRecipe ? 'Сохранить рецепт' : 'Опубликовать рецепт'}
        </button>
      </div>
    </form>
  );
}
