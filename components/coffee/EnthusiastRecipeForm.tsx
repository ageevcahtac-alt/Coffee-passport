'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { BrewingMethodId, BrewingRecipe, Lot } from '@/lib/types/coffee';
import { HOME_BREWER_MODELS, HOME_GRINDER_MODELS } from '@/lib/types/coffee';
import { useGrindConfirmations } from '@/lib/data/useGrindConfirmations';
import { addGrindConfirmation } from '@/lib/data/grindConfirmationsStore';
import { estimateGrindSetting } from '@/lib/utils/grindConvert';
import { useEquipment } from '@/lib/data/useEquipment';
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
  totalTimeSec: string;
  equipmentModel: string;
  notes: string;
  isPublic: boolean;
}

function toFormState(source?: BrewingRecipe): FormState {
  return {
    brewingMethodId: source?.brewingMethodId ?? null,
    doseG: source ? String(source.doseG) : '',
    yieldG: source ? String(source.yieldG) : '',
    measuredTds: '', // always my own reading, never copied from the source recipe
    grinderModel: '',
    grinderSetting: '',
    waterTempC: source ? String(source.waterTempC) : '',
    waterBrand: source?.waterBrand ?? '',
    waterTds: source?.waterTds !== null && source?.waterTds !== undefined ? String(source.waterTds) : '',
    waterCustomMineralization: source?.waterCustomMineralization ?? '',
    bloomTimeSec: source?.bloomTimeSec !== null && source?.bloomTimeSec !== undefined ? String(source.bloomTimeSec) : '',
    totalTimeSec: source ? String(source.totalTimeSec) : '',
    equipmentModel: '',
    notes: source?.notes ?? '',
    isPublic: false,
  };
}

// Used both standalone (a personal log entry not tied to any pro recipe) and
// from the "Адаптировать под себя" flow — sourceRecipe prefills dose/yield/
// water/notes, leaving grinder/equipment blank so the user maps them to
// their own home gear (e.g. an EK43 setting doesn't transfer to a Comandante).
export function EnthusiastRecipeForm({
  lot,
  currentUserId,
  currentUserName,
  sourceRecipe,
  onSave,
  onCancel,
}: {
  lot: Lot;
  currentUserId: string;
  currentUserName: string;
  sourceRecipe?: BrewingRecipe;
  onSave: (recipe: RecipeInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(sourceRecipe));
  const grindConfirmations = useGrindConfirmations();
  const myEquipment = useEquipment().find((setup) => setup.userId === currentUserId);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Auto-fill from the saved Equipment Garage setup (see
  // app/(site)/journey/equipment/page.tsx) whenever the brewing method
  // changes — espresso pulls the espresso setup, every other method pulls
  // the filter setup. Only fills fields that are still empty, so it never
  // clobbers an adapt-flow prefill or something the user already typed.
  useEffect(() => {
    if (!form.brewingMethodId || !myEquipment) return;
    const isEspressoMethod = form.brewingMethodId === 'espresso';
    const grinder = isEspressoMethod ? myEquipment.espressoGrinder : myEquipment.filterGrinder;
    const water = isEspressoMethod ? myEquipment.espressoWater : myEquipment.filterWater;

    setForm((prev) => ({
      ...prev,
      grinderModel: prev.grinderModel || grinder,
      equipmentModel: isEspressoMethod ? prev.equipmentModel || myEquipment.espressoMachine : prev.equipmentModel,
      waterCustomMineralization: prev.waterCustomMineralization || water,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the method changes, not on every equipment/form update
  }, [form.brewingMethodId]);

  // Only meaningful in the adapt flow, once the user has picked a grinder
  // that differs from the source recipe's — see lib/utils/grindConvert.ts.
  const grindEstimate = useMemo(() => {
    if (!sourceRecipe?.grinderModel || !form.grinderModel || !form.brewingMethodId) return null;
    if (form.grinderModel === sourceRecipe.grinderModel) return null;
    return estimateGrindSetting({
      fromModel: sourceRecipe.grinderModel,
      fromSettingText: sourceRecipe.grinderSetting,
      toModel: form.grinderModel,
      brewingMethodId: form.brewingMethodId,
      confirmations: grindConfirmations,
    });
  }, [sourceRecipe, form.grinderModel, form.brewingMethodId, grindConfirmations]);

  const canSave = Boolean(form.brewingMethodId && form.doseG && form.yieldG);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.brewingMethodId || !canSave) return;

    // Every time an adapted recipe is saved with a real grinder setting on
    // a different grinder than the source, that's a genuine data point —
    // feed it back so future estimates for this pair lean on community
    // experience instead of the static reference table.
    if (
      sourceRecipe?.grinderModel &&
      form.grinderModel &&
      form.grinderModel !== sourceRecipe.grinderModel &&
      form.grinderSetting.trim()
    ) {
      addGrindConfirmation({
        fromModel: sourceRecipe.grinderModel,
        fromSetting: sourceRecipe.grinderSetting,
        toModel: form.grinderModel,
        toSetting: form.grinderSetting.trim(),
        brewingMethodId: form.brewingMethodId,
      });
    }

    const recipe: RecipeInput = {
      lotId: lot.id,
      brewingMethodId: form.brewingMethodId,
      authorType: 'enthusiast',
      authorId: currentUserId,
      authorName: currentUserName,
      isBenchmark: false,
      parentRecipeId: sourceRecipe?.id ?? null,
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
      preInfusionSec: null,
      flowRateGPerSec: null,
      totalTimeSec: Number(form.totalTimeSec) || 0,
      equipmentModel: form.equipmentModel.trim(),
      pressureBar: null,
      pressureProfile: '',
      notes: form.notes.trim(),
      isPublic: form.isPublic,
    };

    onSave(recipe);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {sourceRecipe && (
        <p className="text-xs text-ink-400">
          Адаптируется от рецепта «{sourceRecipe.authorName}» — доза, выход, вода и заметки скопированы, помол и
          оборудование оставлены пустыми под вашу технику.
        </p>
      )}

      <div>
        <p className="section-label mb-4">Способ приготовления</p>
        <BrewingMethodSelector value={form.brewingMethodId} onChange={(id) => update('brewingMethodId', id)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="er-dose" className="block text-xs text-ink-400 mb-1.5">Доза, г</label>
          <input id="er-dose" type="number" step="0.1" value={form.doseG}
            onChange={(e) => update('doseG', e.target.value)} required className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="er-yield" className="block text-xs text-ink-400 mb-1.5">Выход, г/мл</label>
          <input id="er-yield" type="number" step="0.1" value={form.yieldG}
            onChange={(e) => update('yieldG', e.target.value)} required className={fieldClasses} />
        </div>
      </div>

      <div>
        <label htmlFor="er-measured-tds" className="block text-xs text-ink-400 mb-1.5">
          TDS чашки, % (если мерили рефрактометром) — необязательно
        </label>
        <input id="er-measured-tds" type="number" step="0.01" min="0" value={form.measuredTds}
          onChange={(e) => update('measuredTds', e.target.value)} placeholder="1.32" className={fieldClasses} />
      </div>

      <ComboSelect label="Кофемолка" options={HOME_GRINDER_MODELS} value={form.grinderModel}
        onChange={(v) => update('grinderModel', v)} />

      {grindEstimate && (
        <div className="rounded-md border border-dashed border-gold-400/60 bg-gold-50/50 px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-xs text-ink-700 leading-relaxed">
            {sourceRecipe?.grinderModel} → {form.grinderModel}: {grindEstimate.displayText}
          </p>
          <button
            type="button"
            onClick={() => update('grinderSetting', String(grindEstimate.rawValue))}
            className="text-xs text-ink-900 underline underline-offset-2 hover:text-ink-700 shrink-0"
          >
            Подставить
          </button>
        </div>
      )}

      <div>
        <label htmlFor="er-setting" className="block text-xs text-ink-400 mb-1.5">Настройка помола</label>
        <input id="er-setting" value={form.grinderSetting} onChange={(e) => update('grinderSetting', e.target.value)}
          placeholder="Клик 18 / деление 4.5" className={fieldClasses} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="er-temp" className="block text-xs text-ink-400 mb-1.5">Температура воды, °C</label>
          <input id="er-temp" type="number" value={form.waterTempC} onChange={(e) => update('waterTempC', e.target.value)}
            className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="er-time" className="block text-xs text-ink-400 mb-1.5">Общее время, сек</label>
          <input id="er-time" type="number" value={form.totalTimeSec} onChange={(e) => update('totalTimeSec', e.target.value)}
            className={fieldClasses} />
        </div>
      </div>

      <div>
        <label htmlFor="er-water" className="block text-xs text-ink-400 mb-1.5">Вода / минерализация</label>
        <input id="er-water" value={form.waterCustomMineralization} onChange={(e) => update('waterCustomMineralization', e.target.value)}
          placeholder="Third Wave Water Classic, бутилированная и т.п." className={fieldClasses} />
      </div>

      <div>
        <label htmlFor="er-bloom" className="block text-xs text-ink-400 mb-1.5">Блум, сек</label>
        <input id="er-bloom" type="number" value={form.bloomTimeSec} onChange={(e) => update('bloomTimeSec', e.target.value)}
          className={fieldClasses} />
      </div>

      <ComboSelect label="Оборудование (пуровер, кофеварка)" options={HOME_BREWER_MODELS} value={form.equipmentModel}
        onChange={(v) => update('equipmentModel', v)} />

      <div>
        <label htmlFor="er-notes" className="section-label mb-4 block">
          Как получилось / сравнение с описанием обжарщика
        </label>
        <textarea id="er-notes" rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)}
          className={fieldClasses} />
      </div>

      <label className="flex items-start gap-3 rounded-md border border-ink-200 bg-parchment-100 p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isPublic}
          onChange={(e) => update('isPublic', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-current text-gold-500 shrink-0"
        />
        <span className="text-xs text-ink-700 leading-relaxed">
          Опубликовать рецепт в общедоступной базе Coffee Passport (отказываюсь от авторских претензий, разрешаю
          свободное использование рецепта сообществом).
        </span>
      </label>

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
          Сохранить в мой лог
        </button>
      </div>
    </form>
  );
}
