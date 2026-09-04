'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { BrewingRecipe, Lot } from '@/lib/types/coffee';
import { HOME_GRINDER_MODELS } from '@/lib/types/coffee';
import { useGrindConfirmations } from '@/lib/data/useGrindConfirmations';
import { addGrindConfirmation } from '@/lib/data/grindConfirmationsStore';
import { estimateGrindSetting } from '@/lib/utils/grindConvert';
import { useEquipment } from '@/lib/data/useEquipment';
import { syncEquipmentFromSupabase } from '@/lib/data/equipmentStore';
import { useCustomDevices } from '@/lib/data/useCustomDevices';
import { useCustomBrewMethods } from '@/lib/data/useCustomBrewMethods';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { buildFilterDeviceCatalog } from '@/lib/utils/filterDeviceCatalog';
import { canCreateDraft } from '@/lib/utils/recipeLimits';
import { resolveBrewMethodLabel } from '@/lib/utils/resolveBrewMethodLabel';
import { ComboSelect } from '@/components/shared/ComboSelect';
import { RecipeBrewMethodSelector } from '@/components/coffee/RecipeBrewMethodSelector';
import { RecipeQuotaPanel } from '@/components/coffee/RecipeQuotaPanel';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

type RecipeInput = Omit<BrewingRecipe, 'id' | 'createdAt'>;

interface FormState {
  brewingMethodId: string | null;
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

// source drives the "Адаптировать под себя" prefill — dose/yield/water/
// notes copied, grinder/equipment/measuredTds deliberately left blank (the
// user maps them to their own gear). editingRecipe drives true in-place
// editing — every field (grinder/equipment/measuredTds included) is
// copied, since this is the SAME recipe, not a new one adapted from it.
function toFormState(source?: BrewingRecipe, editingRecipe?: BrewingRecipe): FormState {
  const full = editingRecipe;
  if (full) {
    return {
      brewingMethodId: full.brewingMethodId,
      doseG: String(full.doseG),
      yieldG: String(full.yieldG),
      measuredTds: full.measuredTdsPercent !== null ? String(full.measuredTdsPercent) : '',
      grinderModel: full.grinderModel,
      grinderSetting: full.grinderSetting,
      waterTempC: String(full.waterTempC),
      waterBrand: full.waterBrand,
      waterTds: full.waterTds !== null ? String(full.waterTds) : '',
      waterCustomMineralization: full.waterCustomMineralization,
      bloomTimeSec: full.bloomTimeSec !== null ? String(full.bloomTimeSec) : '',
      totalTimeSec: String(full.totalTimeSec),
      equipmentModel: full.equipmentModel,
      notes: full.notes,
      isPublic: full.isPublic,
    };
  }
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
  editingRecipe,
  onSave,
  onCancel,
}: {
  lot: Lot;
  currentUserId: string;
  currentUserName: string;
  sourceRecipe?: BrewingRecipe;
  // True in-place edit of an existing recipe the user owns — distinct from
  // sourceRecipe's "Адаптировать под себя" (which prefills a subset of
  // fields into a brand-new recipe). The caller passes updateBrewingRecipe
  // instead of addRecipeAsDraft to onSave's result when this is set.
  editingRecipe?: BrewingRecipe;
  onSave: (recipe: RecipeInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(sourceRecipe, editingRecipe));
  const grindConfirmations = useGrindConfirmations();
  // Garage might not be loaded locally yet if the user never visited
  // /journey/equipment on this device — pull it from Supabase so auto-fill
  // (the effect below) still has something to work with.
  useEffect(() => {
    void syncEquipmentFromSupabase(currentUserId);
  }, [currentUserId]);
  const myEquipment = useEquipment().find((setup) => setup.userId === currentUserId);
  const approvedCustomDevices = useCustomDevices().filter((device) => device.approved);
  const filterDeviceCatalog = useMemo(
    () => buildFilterDeviceCatalog(approvedCustomDevices, myEquipment?.favoriteDeviceIds ?? []),
    [approvedCustomDevices, myEquipment]
  );
  const customBrewMethods = useCustomBrewMethods().filter(
    (method) => method.ownerType === 'enthusiast' && method.ownerId === currentUserId
  );
  const allRecipes = useBrewingRecipes();
  const methodLabel = form.brewingMethodId ? resolveBrewMethodLabel(form.brewingMethodId, customBrewMethods) : '';

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Auto-fill from the saved Equipment Garage setup (see
  // components/coffee/EquipmentGarage.tsx) whenever the brewing method
  // changes — the RecipeBrewMethodSelector's 10 categories + custom
  // methods are all filter/immersion methods (no espresso among them, see
  // STANDARD_BREW_METHOD_CATEGORIES), so this always pulls the filter Garage
  // setup now. Only fills fields that are still empty, so it never clobbers
  // an adapt-flow prefill or something the user already typed.
  useEffect(() => {
    if (!form.brewingMethodId || !myEquipment) return;
    const grinder = myEquipment.filterGrinder;
    const water = myEquipment.filterWater;

    setForm((prev) => ({
      ...prev,
      grinderModel: prev.grinderModel || grinder,
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

  const draftSlotAvailable =
    Boolean(editingRecipe) || !form.brewingMethodId || canCreateDraft(allRecipes, 'enthusiast', currentUserId, form.brewingMethodId);
  const canSave = Boolean(form.brewingMethodId && form.doseG && form.yieldG) && draftSlotAvailable;

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
      parentRecipeId: editingRecipe ? editingRecipe.parentRecipeId : sourceRecipe?.id ?? null,
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
      // On a fresh save this is the "Опубликовать сразу" checkbox's intent
      // — the caller (see ExtractionTab's handleSaveEnthusiastRecipe) always
      // inserts as a draft first, then attempts an actual publish only when
      // this is true, subject to the per-method cooldown. While editing,
      // the checkbox is hidden (see JSX below) so form.isPublic just stays
      // at its initial editingRecipe.isPublic value — editing never changes
      // publish state by itself, that's a separate action (RecipeCard's
      // "Опубликовать" button).
      isPublic: form.isPublic,
    };

    onSave(recipe);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {sourceRecipe && !editingRecipe && (
        <p className="text-xs text-ink-400">
          Адаптируется от рецепта «{sourceRecipe.authorName}» — доза, выход, вода и заметки скопированы, помол и
          оборудование оставлены пустыми под вашу технику.
        </p>
      )}

      <div>
        <p className="section-label mb-4">Способ приготовления</p>
        <RecipeBrewMethodSelector
          ownerType="enthusiast"
          ownerId={currentUserId}
          value={form.brewingMethodId}
          onChange={(id) => update('brewingMethodId', id)}
        />
      </div>

      {form.brewingMethodId && (
        <RecipeQuotaPanel
          authorType="enthusiast"
          authorId={currentUserId}
          brewingMethodId={form.brewingMethodId}
          methodLabel={methodLabel}
        />
      )}

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

      {form.brewingMethodId && (
        <ComboSelect
          label="Устройство для фильтра"
          options={filterDeviceCatalog.options}
          priorityOptions={filterDeviceCatalog.priorityOptions}
          value={form.equipmentModel}
          onChange={(v) => update('equipmentModel', v)}
        />
      )}

      <div>
        <label htmlFor="er-notes" className="section-label mb-4 block">
          Как получилось / сравнение с описанием обжарщика
        </label>
        <textarea id="er-notes" rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)}
          className={fieldClasses} />
      </div>

      {!editingRecipe && (
        <label className="flex items-start gap-3 rounded-md border border-ink-200 bg-parchment-100 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => update('isPublic', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-current text-gold-500 shrink-0"
          />
          <span className="text-xs text-ink-700 leading-relaxed">
            Опубликовать рецепт в общедоступной базе Coffee Passport (отказываюсь от авторских претензий, разрешаю
            свободное использование рецепта сообществом) — при доступной публикации для этого способа.
          </span>
        </label>
      )}

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
          {editingRecipe ? 'Сохранить изменения' : 'Сохранить в мой лог'}
        </button>
      </div>
    </form>
  );
}
