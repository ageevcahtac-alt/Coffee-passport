'use client';

import { useState } from 'react';
import type { BrewingRecipe } from '@/lib/types/coffee';
import { computeExtraction } from '@/lib/utils/extraction';
import { ExtractionChart, type ExtractionPoint } from '@/components/coffee/ExtractionChart';
import { VoteButtons } from '@/components/coffee/VoteButtons';

export function RecipeCard({
  recipe,
  currentUserId,
  onAdapt,
  isCommunityTop = false,
  titleOverride,
}: {
  recipe: BrewingRecipe;
  currentUserId: string;
  onAdapt?: (recipe: BrewingRecipe) => void;
  // Computed by the caller (see ExtractionTab.tsx) from live vote counts —
  // never a stored flag. There is deliberately no manual "assign this"
  // action anywhere; the algorithm is the only source of this badge.
  isCommunityTop?: boolean;
  // Used by RoasterCafeRecommendations to relabel the card "Рекомендация
  // обжарщика" / "Рекомендация кофейни" in that always-both-visible
  // comparison layout, instead of the granular authorship badge below
  // (still the right label everywhere this override isn't passed — a
  // per-tab list in ExtractionTab, say, where several roaster/shop
  // recipes can appear side by side and need to stay distinguishable).
  titleOverride?: string;
}) {
  const isOwn = recipe.authorType === 'enthusiast' && recipe.authorId === currentUserId;
  const ratio = recipe.doseG > 0 ? recipe.yieldG / recipe.doseG : null;
  const isEspresso = recipe.brewingMethodId === 'espresso';
  const badge = titleOverride ? { text: titleOverride, className: getAuthorBadge(recipe, isOwn).className } : getAuthorBadge(recipe, isOwn);
  const isVotable = recipe.authorType === 'enthusiast' && recipe.isPublic;

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
    <div
      className={`rounded-md border bg-parchment-100 p-5 ${
        isCommunityTop ? 'border-gold-400 ring-1 ring-gold-400/40' : 'border-ink-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          {isCommunityTop && (
            <span className="inline-block mb-1.5 rounded-full bg-gold-400 text-ink-900 text-[10px] font-medium uppercase tracking-widest2 px-2 py-0.5">
              🔥 Топ сообщества
            </span>
          )}
          <p className="text-xs uppercase tracking-widest2 text-ink-400 truncate">{recipe.authorName}</p>
          <span
            className={`inline-block mt-1 rounded-full border text-[10px] uppercase tracking-widest2 px-2 py-0.5 ${badge.className}`}
          >
            {badge.text}
          </span>
          {isOwn && (recipe.grinderModel || recipe.equipmentModel) && (
            <p className="text-[11px] text-ink-400 mt-1.5 break-words">
              {[recipe.grinderModel, recipe.equipmentModel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {ratio !== null && (
          <span className="data-value text-sm text-gold-500 shrink-0">1:{ratio.toFixed(1)}</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mb-4">
        <Row label="Доза" value={`${recipe.doseG} г`} />
        <Row label="Выход" value={`${recipe.yieldG} г`} />
        {recipe.grinderModel && <Row label="Кофемолка" value={recipe.grinderModel} full />}
        {recipe.grinderSetting && <Row label="Помол" value={recipe.grinderSetting} full />}
        {recipe.waterTempC > 0 && <Row label="Вода" value={`${recipe.waterTempC}°C`} />}
        {(recipe.waterBrand || recipe.waterTds || recipe.waterCustomMineralization) && (
          <Row
            label="Минерализация"
            full
            value={[recipe.waterBrand, recipe.waterTds ? `${recipe.waterTds} ppm` : '', recipe.waterCustomMineralization]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        {recipe.bloomTimeSec !== null && <Row label="Блум" value={`${recipe.bloomTimeSec} сек`} />}
        {recipe.preInfusionSec !== null && <Row label="Пре-инфузия" value={`${recipe.preInfusionSec} сек`} />}
        {recipe.flowRateGPerSec !== null && <Row label="Поток" value={`${recipe.flowRateGPerSec} г/сек`} />}
        {recipe.totalTimeSec > 0 && <Row label="Общее время" value={`${recipe.totalTimeSec} сек`} />}
        {recipe.equipmentModel && <Row label="Оборудование" value={recipe.equipmentModel} full />}
        {isEspresso && recipe.pressureBar !== null && <Row label="Давление" value={`${recipe.pressureBar} bar`} />}
        {isEspresso && recipe.pressureProfile && <Row label="Профиль давления" value={recipe.pressureProfile} full />}
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

      <div className="flex items-center justify-between gap-4">
        {!isOwn && onAdapt && (
          <button
            type="button"
            onClick={() => onAdapt(recipe)}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Адаптировать под себя
          </button>
        )}
        {isVotable && <VoteButtons recipeId={recipe.id} currentUserId={currentUserId} />}
      </div>
    </div>
  );
}

// Who authored this recipe determines both the label and the accent color
// — gold is reserved for "official" (roaster) content per DESIGN.md, moss
// marks a coffee shop's own adaptation, and rating (not gold) marks the
// viewer's own recipe so it never reads as if it were an official pick.
function getAuthorBadge(recipe: BrewingRecipe, isOwn: boolean): { text: string; className: string } {
  if (recipe.authorType === 'roaster') {
    return {
      text: recipe.isBenchmark ? `Официальный бенчмарк · ${recipe.authorName}` : `Рецепт обжарщика · ${recipe.authorName}`,
      className: 'border-gold-400 text-gold-500',
    };
  }
  if (recipe.authorType === 'coffee_shop') {
    return { text: `Рецепт кофейни · ${recipe.authorName}`, className: 'border-moss-500 text-moss-500' };
  }
  if (isOwn) {
    return { text: 'Ваш рецепт', className: 'border-rating text-rating' };
  }
  return { text: `Рецепт сообщества · ${recipe.authorName}`, className: 'border-ink-200 text-ink-400' };
}

// `full` spans both grid columns — needed for any value that can run long
// (grinder/equipment model names, the combined water-mineralization
// string) so it wraps onto its own line instead of colliding with its
// label in a cramped half-width mobile column. Short numeric fields keep
// the compact two-up label/value row.
function Row({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  if (!value) return null;
  if (full) {
    return (
      <div className="col-span-2 min-w-0">
        <dt className="text-ink-400 text-xs mb-0.5">{label}</dt>
        <dd className="data-value text-ink-900 break-words">{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="text-ink-400 shrink-0">{label}</dt>
      <dd className="data-value text-ink-900 text-right truncate">{value}</dd>
    </div>
  );
}
