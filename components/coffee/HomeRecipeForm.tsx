'use client';

import { useState } from 'react';
import type { BrewingMethodId, HomeRecipe } from '@/lib/types/coffee';
import { HOME_GRINDER_MODELS } from '@/lib/types/coffee';
import { ComboSelect } from '@/components/shared/ComboSelect';
import { BrewingMethodSelector } from './BrewingMethodSelector';

export type HomeRecipeFormValues = Omit<HomeRecipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Create/edit form for a Home Brew Lab recipe (see lib/types/coffee.ts —
// HomeRecipe). Passing `initial` pre-fills every field for editing; isPublic
// is deliberately not editable here — publishing to /recipes is a card-level
// action ("Поделиться с сообществом" in HomeRecipeCard), not a form field.
export function HomeRecipeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: HomeRecipe;
  onSave: (values: HomeRecipeFormValues) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [brewingMethod, setBrewingMethod] = useState<BrewingMethodId | null>(initial?.brewingMethod ?? null);
  const [grinderModel, setGrinderModel] = useState(initial?.grinderModel ?? '');
  const [doseG, setDoseG] = useState(initial ? String(initial.doseG) : '');
  const [waterG, setWaterG] = useState(initial ? String(initial.waterG) : '');
  const [waterTempC, setWaterTempC] = useState(initial ? String(initial.waterTempC) : '');
  const [waterMineralization, setWaterMineralization] = useState(initial?.waterMineralization ?? '');
  const [grindSetting, setGrindSetting] = useState(initial?.grindSetting ?? '');
  const [brewTimeSec, setBrewTimeSec] = useState(
    initial?.brewTimeSec != null ? String(initial.brewTimeSec) : ''
  );
  const [preInfusionSec, setPreInfusionSec] = useState(
    initial?.preInfusionSec != null ? String(initial.preInfusionSec) : ''
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [isTop, setIsTop] = useState(initial?.isTop ?? false);

  const canSave = title.trim().length > 0 && brewingMethod !== null;

  function handleSubmit() {
    if (!brewingMethod || !canSave) return;
    onSave({
      title: title.trim(),
      brewingMethod,
      grinderModel: grinderModel.trim(),
      doseG: Number(doseG) || 0,
      waterG: Number(waterG) || 0,
      waterTempC: Number(waterTempC) || 0,
      waterMineralization: waterMineralization.trim(),
      grindSetting: grindSetting.trim(),
      brewTimeSec: toNumberOrNull(brewTimeSec),
      preInfusionSec: toNumberOrNull(preInfusionSec),
      notes: notes.trim(),
      isTop,
      isPublic: initial?.isPublic ?? false,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <label htmlFor="home-recipe-title" className="section-label mb-4 block">
          Название рецепта
        </label>
        <input
          id="home-recipe-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Утренний V60"
          className={fieldClasses}
        />
      </div>

      <div>
        <p className="section-label mb-4">Способ заваривания</p>
        <BrewingMethodSelector value={brewingMethod} onChange={setBrewingMethod} name="home-recipe-method" />
      </div>

      <ComboSelect label="Кофемолка" options={HOME_GRINDER_MODELS} value={grinderModel} onChange={setGrinderModel} />

      <div>
        <p className="section-label mb-4">Параметры рецепта</p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="home-recipe-dose" className="block text-xs text-ink-400 mb-1.5">
                Закладка кофе, г
              </label>
              <input
                id="home-recipe-dose"
                type="number"
                min="0"
                step="0.1"
                value={doseG}
                onChange={(e) => setDoseG(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="home-recipe-water" className="block text-xs text-ink-400 mb-1.5">
                Вода, мл/г
              </label>
              <input
                id="home-recipe-water"
                type="number"
                min="0"
                step="1"
                value={waterG}
                onChange={(e) => setWaterG(e.target.value)}
                className={fieldClasses}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="home-recipe-temp" className="block text-xs text-ink-400 mb-1.5">
                Температура воды, °C
              </label>
              <input
                id="home-recipe-temp"
                type="number"
                min="0"
                step="1"
                value={waterTempC}
                onChange={(e) => setWaterTempC(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="home-recipe-grind" className="block text-xs text-ink-400 mb-1.5">
                Помол (щелчки / микроны)
              </label>
              <input
                id="home-recipe-grind"
                value={grindSetting}
                onChange={(e) => setGrindSetting(e.target.value)}
                placeholder="Comandante клик 24"
                className={fieldClasses}
              />
            </div>
          </div>
          <div>
            <label htmlFor="home-recipe-mineral" className="block text-xs text-ink-400 mb-1.5">
              Профиль / минерализация воды
            </label>
            <input
              id="home-recipe-mineral"
              value={waterMineralization}
              onChange={(e) => setWaterMineralization(e.target.value)}
              placeholder="Third Wave Water Classic, ~150 ppm"
              className={fieldClasses}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="home-recipe-brewtime" className="block text-xs text-ink-400 mb-1.5">
                Время экстракции, сек
              </label>
              <input
                id="home-recipe-brewtime"
                type="number"
                min="0"
                step="1"
                value={brewTimeSec}
                onChange={(e) => setBrewTimeSec(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="home-recipe-preinfusion" className="block text-xs text-ink-400 mb-1.5">
                Предсмачивание, сек
              </label>
              <input
                id="home-recipe-preinfusion"
                type="number"
                min="0"
                step="1"
                value={preInfusionSec}
                onChange={(e) => setPreInfusionSec(e.target.value)}
                className={fieldClasses}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="home-recipe-notes" className="section-label mb-4 block">
          Заметки — как меняется вкус при подстройке параметров
        </label>
        <textarea
          id="home-recipe-notes"
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
