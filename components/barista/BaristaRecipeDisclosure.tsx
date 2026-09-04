'use client';

import { useState } from 'react';
import type { BrewingMethodId } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { useBaristaProfiles } from '@/lib/data/useBaristaProfiles';
import { UNSPECIFIED_BARISTA_ID } from '@/lib/data/baristas';
import { BaristaAvatar } from './BaristaProfileCard';

// "Авторский рецепт от [Имя]" — shown on the guest's saved drink card
// (TastingRecordDetails) when the barista who made that cup (record.
// baristaId) has published their own recipe (public.recipes,
// author_type='barista') for this exact lot + brewing method. Renders
// nothing when there's no match — most cups won't have one yet.
export function BaristaRecipeDisclosure({
  lotId,
  brewingMethod,
  baristaId,
}: {
  lotId: string;
  brewingMethod: BrewingMethodId;
  baristaId: string;
}) {
  const [open, setOpen] = useState(false);
  const barista = useBaristaProfiles().find((candidate) => candidate.id === baristaId);
  const recipes = useBrewingRecipes().filter(
    (recipe) =>
      recipe.lotId === lotId &&
      recipe.brewingMethodId === brewingMethod &&
      recipe.authorType === 'barista' &&
      recipe.authorId === baristaId
  );
  // The barista's own default for this method, when they've published more
  // than one variant — falls back to whichever was saved first.
  const recipe = recipes.find((candidate) => candidate.isBenchmark) ?? recipes[0];

  if (!barista || barista.id === UNSPECIFIED_BARISTA_ID || !recipe) return null;

  const ratio = recipe.doseG > 0 ? recipe.yieldG / recipe.doseG : null;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-parchment-200 transition-colors"
      >
        <BaristaAvatar barista={barista} />
        <span className="min-w-0 flex-1 text-sm text-ink-900">
          Авторский рецепт от <strong className="font-medium">{barista.name}</strong>
        </span>
        <span className="text-ink-400 text-xs shrink-0">{open ? 'Скрыть ▲' : 'Параметры ▼'}</span>
      </button>

      {open && (
        <div className="border-t border-ink-200 px-4 py-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Row label="Доза" value={`${recipe.doseG} г`} />
            <Row label="Выход" value={ratio !== null ? `${recipe.yieldG} г · 1:${ratio.toFixed(1)}` : `${recipe.yieldG} г`} />
            {recipe.waterTempC > 0 && <Row label="Температура воды" value={`${recipe.waterTempC}°C`} />}
            {recipe.grinderSetting && <Row label="Помол" value={recipe.grinderSetting} />}
            {recipe.bloomTimeSec !== null && <Row label="Блум" value={`${recipe.bloomTimeSec} сек`} />}
            {recipe.preInfusionSec !== null && <Row label="Пре-инфузия" value={`${recipe.preInfusionSec} сек`} />}
            {recipe.flowRateGPerSec !== null && <Row label="Поток пролива" value={`${recipe.flowRateGPerSec} г/сек`} />}
            {recipe.totalTimeSec > 0 && <Row label="Общее время" value={`${recipe.totalTimeSec} сек`} />}
            {recipe.pressureBar !== null && <Row label="Давление" value={`${recipe.pressureBar} bar`} />}
          </dl>
          {recipe.notes && <p className="text-sm text-ink-700 leading-relaxed mt-4">{recipe.notes}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="text-ink-400 shrink-0">{label}</dt>
      <dd className="data-value text-ink-900 text-right truncate">{value}</dd>
    </div>
  );
}
