'use client';

import { useState } from 'react';
import type { KitchenRecipe } from '@/lib/types/kitchen';
import { BrewingParamsFields, emptyBrewingParams, type BrewingParamsValues } from './BrewingParamsFields';

export type KitchenRecipeFormValues = Omit<KitchenRecipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBrewingParams(recipe?: KitchenRecipe): BrewingParamsValues {
  if (!recipe) return emptyBrewingParams();
  return {
    brewingMethod: recipe.brewingMethod,
    grinderModel: recipe.grinderModel,
    doseG: String(recipe.doseG),
    waterG: String(recipe.waterG),
    waterTempC: String(recipe.waterTempC),
    waterMineralization: recipe.waterMineralization,
    grindSetting: recipe.grindSetting,
    brewTimeSec: recipe.brewTimeSec != null ? String(recipe.brewTimeSec) : '',
    preInfusionSec: recipe.preInfusionSec != null ? String(recipe.preInfusionSec) : '',
  };
}

// Create/edit form for a "Мои рецепты" entry (Coffee Kitchen, was Home Brew
// Lab / HomeRecipeForm). Passing `initial` pre-fills every field for
// editing; isPublic is deliberately not editable here — publishing to
// /recipes is a card-level action ("Поделиться с сообществом" in
// KitchenRecipeCard), not a form field.
export function KitchenRecipeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: KitchenRecipe;
  onSave: (values: KitchenRecipeFormValues) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [brewing, setBrewing] = useState<BrewingParamsValues>(toBrewingParams(initial));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [isTop, setIsTop] = useState(initial?.isTop ?? false);

  const canSave = title.trim().length > 0 && brewing.brewingMethod !== null;

  function handleSubmit() {
    if (!brewing.brewingMethod || !canSave) return;
    onSave({
      title: title.trim(),
      brewingMethod: brewing.brewingMethod,
      grinderModel: brewing.grinderModel.trim(),
      doseG: Number(brewing.doseG) || 0,
      waterG: Number(brewing.waterG) || 0,
      waterTempC: Number(brewing.waterTempC) || 0,
      waterMineralization: brewing.waterMineralization.trim(),
      grindSetting: brewing.grindSetting.trim(),
      brewTimeSec: toNumberOrNull(brewing.brewTimeSec),
      preInfusionSec: toNumberOrNull(brewing.preInfusionSec),
      notes: notes.trim(),
      isTop,
      isPublic: initial?.isPublic ?? false,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <label htmlFor="kitchen-recipe-title" className="section-label mb-4 block">
          Название рецепта
        </label>
        <input
          id="kitchen-recipe-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Утренний V60"
          className={fieldClasses}
        />
      </div>

      <BrewingParamsFields value={brewing} onChange={setBrewing} idPrefix="kitchen-recipe" />

      <div>
        <label htmlFor="kitchen-recipe-notes" className="section-label mb-4 block">
          Заметки — как меняется вкус при подстройке параметров
        </label>
        <textarea
          id="kitchen-recipe-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Помол чуть грубее — меньше горечи, но и тело слабее…"
          className={fieldClasses}
        />
      </div>

      <label className="flex items-center gap-3 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3.5 cursor-pointer">
        <input
          type="checkbox"
          checked={isTop}
          onChange={(e) => setIsTop(e.target.checked)}
          className="h-4 w-4 accent-current text-gold-500"
        />
        <span className="text-sm text-ink-900">★ Отметить как «Мой Топ»</span>
      </label>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4 flex-1
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4 flex-[2]
                     hover:bg-ink-800 transition-colors
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          {initial ? 'Сохранить изменения' : 'Сохранить рецепт'}
        </button>
      </div>
      {!canSave && (
        <p className="text-xs text-ink-400 -mt-4 text-center">
          Укажите название и способ заваривания, чтобы сохранить
        </p>
      )}
    </div>
  );
}
