'use client';

import { useState } from 'react';
import type { BrewingRecipe } from '@/lib/types/coffee';
import { computeExtraction } from '@/lib/utils/extraction';
import { ExtractionChart, type ExtractionPoint } from '@/components/coffee/ExtractionChart';

export function RecipeCard({
  recipe,
  currentUserId,
  onAdapt,
}: {
  recipe: BrewingRecipe;
  currentUserId: string;
  onAdapt?: (recipe: BrewingRecipe) => void;
}) {
  const isOwn = recipe.authorType === 'enthusiast' && recipe.authorId === currentUserId;
  const ratio = recipe.doseG > 0 ? recipe.yieldG / recipe.doseG : null;
  const isEspresso = recipe.brewingMethodId === 'espresso';

  const [showExtraction, setShowExtraction] = useState(false);
  const [myTds, setMyTds] = useState('');

  const authorResult = recipe.measuredTdsPercent
    ? computeExtraction({ doseG: recipe.doseG, yieldG: recipe.yieldG, tdsPercent: recipe.measuredTdsPercent })
    : null;
  const myTdsValue = Number(myTds);
  const myResult =
    myTds.trim() && Number.isFinite(myTdsValue) && myTdsValue > 0
      ? computeExtraction({ doseG: recipe.doseG, yieldG: recipe.yieldG, tdsPercent: myTdsValue })
      : null;

  const extractionPoints: ExtractionPoint[] = [
    ...(authorResult
      ? [{ label: `${recipe.authorName}, ${recipe.measuredTdsPercent}%`, ...authorResult, color: '#B8863B' }]
      : []),
    ...(myResult ? [{ label: `Моя чашка, ${myTdsValue}%`, ...myResult, color: '#A0522D' }] : []),
  ];

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs uppercase tracking-widest2 text-ink-400">{recipe.authorName}</p>
          {isOwn && (
            <span className="inline-block mt-1 rounded-full border border-gold-400 text-gold-500 text-[10px] uppercase tracking-widest2 px-2 py-0.5">
              Ваш рецепт
            </span>
          )}
          {recipe.isBenchmark && (
            <span className="inline-block mt-1 rounded-full border border-gold-400 text-gold-500 text-[10px] uppercase tracking-widest2 px-2 py-0.5">
              Официальный бенчмарк
            </span>
          )}
        </div>
        {ratio !== null && (
          <span className="data-value text-sm text-gold-500 shrink-0">1:{ratio.toFixed(1)}</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
        <Row label="Доза" value={`${recipe.doseG} г`} />
        <Row label="Выход" value={`${recipe.yieldG} г`} />
        {recipe.grinderModel && <Row label="Кофемолка" value={recipe.grinderModel} />}
        {recipe.grinderSetting && <Row label="Помол" value={recipe.grinderSetting} />}
        {recipe.waterTempC > 0 && <Row label="Вода" value={`${recipe.waterTempC}°C`} />}
        {(recipe.waterBrand || recipe.waterTds || recipe.waterCustomMineralization) && (
          <Row
            label="Минерализация"
            value={[recipe.waterBrand, recipe.waterTds ? `${recipe.waterTds} ppm` : '', recipe.waterCustomMineralization]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        {recipe.bloomTimeSec !== null && <Row label="Блум" value={`${recipe.bloomTimeSec} сек`} />}
        {recipe.preInfusionSec !== null && <Row label="Пре-инфузия" value={`${recipe.preInfusionSec} сек`} />}
        {recipe.flowRateGPerSec !== null && <Row label="Поток" value={`${recipe.flowRateGPerSec} г/сек`} />}
        {recipe.totalTimeSec > 0 && <Row label="Общее время" value={`${recipe.totalTimeSec} сек`} />}
        {recipe.equipmentModel && <Row label="Оборудование" value={recipe.equipmentModel} />}
        {isEspresso && recipe.pressureBar !== null && <Row label="Давление" value={`${recipe.pressureBar} bar`} />}
        {isEspresso && recipe.pressureProfile && <Row label="Профиль давления" value={recipe.pressureProfile} />}
        {recipe.measuredTdsPercent !== null && <Row label="TDS чашки" value={`${recipe.measuredTdsPercent}%`} />}
      </dl>

      {recipe.notes && <p className="text-sm text-ink-700 leading-relaxed mb-4">{recipe.notes}</p>}

      <div className="border-t border-ink-200 pt-4 mb-4">
        <button
          type="button"
          onClick={() => setShowExtraction((prev) => !prev)}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          {showExtraction ? 'Скрыть график экстракции' : 'Проверить экстракцию'}
        </button>

        {showExtraction && (
          <div className="mt-4">
            {extractionPoints.length === 0 && (
              <p className="text-xs text-ink-400 mb-3">
                Введите TDS вашей чашки (рефрактометр), чтобы увидеть, куда попадает экстракция.
              </p>
            )}
            <ExtractionChart brewingMethodId={recipe.brewingMethodId} points={extractionPoints} />
            <div className="flex items-center gap-2 mt-3">
              <label htmlFor={`my-tds-${recipe.id}`} className="text-xs text-ink-400 shrink-0">
                Мой TDS, %
              </label>
              <input
                id={`my-tds-${recipe.id}`}
                type="number"
                step="0.01"
                min="0"
                value={myTds}
                onChange={(e) => setMyTds(e.target.value)}
                placeholder="1.32"
                className="w-24 rounded-md border border-ink-200 bg-parchment-100 px-2 py-1.5 text-xs data-value text-ink-900 focus:border-gold-400"
              />
              {myResult && <span className="text-xs text-ink-500">EY {myResult.extractionYieldPercent}%</span>}
            </div>
          </div>
        )}
      </div>

      {!isOwn && onAdapt && (
        <button
          type="button"
          onClick={() => onAdapt(recipe)}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          Адаптировать под себя
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="data-value text-ink-900 text-right">{value}</dd>
    </div>
  );
}
