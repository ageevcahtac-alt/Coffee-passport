'use client';

import { useEffect, useState } from 'react';
import {
  BODY_TEXTURE_OPTIONS,
  BREWING_METHODS,
  DEFECT_TAGS,
  SENSORY_TAGS,
  type BrewingRecipe,
  type TastingRecord,
} from '@/lib/types/coffee';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getBaristaById } from '@/lib/data/baristas';
import { formatTastingDate } from '@/lib/utils/date';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { StarRating } from './StarRating';
import { ProducerRoasterCard } from './ProducerRoasterCard';
import { RecipeCard } from './RecipeCard';
import { EnthusiastRecipeForm } from './EnthusiastRecipeForm';

export function TastingDetailModal({
  record,
  onClose,
}: {
  record: TastingRecord;
  onClose: () => void;
}) {
  // This modal only ever opens on the current user's own tasting record —
  // reached from /journey or the CoffeeJourney feed, both already scoped to
  // the signed-in/anonymous-device user — so the record's own userId IS the
  // current user, no separate prop needed.
  const currentUserId = record.userId;
  // undefined = adapt modal closed; null = standalone "log my own recipe"
  // (no source); a BrewingRecipe = adapting from that specific recipe.
  const [adaptingFrom, setAdaptingFrom] = useState<BrewingRecipe | null | undefined>(undefined);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (adaptingFrom !== undefined) {
        setAdaptingFrom(undefined);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, adaptingFrom]);

  const lot = getMergedLotById(record.lotId);
  const roaster = getRoasterById(record.roasterId);
  const shop = getCoffeeShopById(record.coffeeShopId);
  const barista = getBaristaById(record.baristaId);
  const brewingMethod = BREWING_METHODS.find((method) => method.id === record.brewingMethod);

  const recipesForMethod = useBrewingRecipes().filter(
    (recipe) => recipe.lotId === record.lotId && recipe.brewingMethodId === record.brewingMethod
  );
  const featuredRecipe =
    recipesForMethod.find((recipe) => recipe.authorType === 'roaster' && recipe.isBenchmark) ??
    recipesForMethod.find((recipe) => recipe.authorType === 'coffee_shop') ??
    recipesForMethod[0] ??
    null;

  if (!lot || !roaster || !shop) return null;

  function handleSaveAdapted(input: Omit<BrewingRecipe, 'id' | 'createdAt'>) {
    addBrewingRecipe(input);
    setAdaptingFrom(undefined);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${lot.name} — детали дегустации`}
          onClick={(event) => event.stopPropagation()}
          className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                     bg-parchment-100 p-6"
        >
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h2 className="font-display text-2xl text-ink-900 leading-tight">{lot.name}</h2>
              <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">{roaster.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="text-ink-400 text-2xl leading-none px-1 shrink-0"
            >
              ×
            </button>
          </div>

          <p className="text-xs text-ink-300 mb-6">Попробовано {formatTastingDate(record.createdAt)}</p>

          <p className="section-label mb-3">Кофейня и способ</p>
          <p className="text-sm text-ink-900 mb-1">
            {shop.name} · {shop.city}
          </p>
          <p className="text-sm text-ink-400 mb-6">{brewingMethod?.label ?? record.brewingMethod}</p>

          <div className="mb-6">
            <p className="section-label mb-3">Рецепт для этого способа</p>
            {featuredRecipe ? (
              <RecipeCard
                recipe={featuredRecipe}
                currentUserId={currentUserId}
                onAdapt={(recipe) => setAdaptingFrom(recipe)}
              />
            ) : (
              <p className="text-sm text-ink-400 mb-3">
                Для этого способа пока нет опубликованных рецептов.
              </p>
            )}
            <button
              type="button"
              onClick={() => setAdaptingFrom(null)}
              className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-3"
            >
              + Записать свой рецепт
            </button>
          </div>

          <p className="section-label mb-3">Оценка кофе</p>
          <div className="mb-6">
            <StarRating value={record.rating} label={`Оценка кофе ${record.rating} из 5`} />
          </div>

          {record.sensoryTags.length > 0 && (
            <>
              <p className="section-label mb-3">Вкусовые впечатления</p>
              <ul className="flex flex-col gap-1.5 mb-6">
                {record.sensoryTags.map((tagId) => {
                  const tag = SENSORY_TAGS.find((candidate) => candidate.id === tagId);
                  const subs = record.subDescriptors[tagId];
                  return (
                    <li key={tagId} className="text-sm text-ink-700">
                      {tag?.label ?? tagId}
                      {subs && subs.length > 0 && (
                        <span className="text-ink-400"> ({subs.join(', ')})</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {record.bodyTexture && (
            <div className="mb-6">
              <p className="section-label mb-3">Текстура тела</p>
              <p className="text-sm text-ink-700">
                {BODY_TEXTURE_OPTIONS.find((option) => option.id === record.bodyTexture)?.label}
              </p>
            </div>
          )}

          {record.defects.length > 0 && (
            <div className="mb-6">
              <p className="section-label mb-3">Дефекты во вкусе</p>
              <ul className="flex flex-wrap gap-2">
                {record.defects.map((defectId) => {
                  const defect = DEFECT_TAGS.find((candidate) => candidate.id === defectId);
                  return (
                    <li
                      key={defectId}
                      className="rounded-full border border-ink-700 bg-ink-100 px-3 py-1.5
                                 text-xs text-ink-900"
                    >
                      {defect?.label ?? defectId}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {record.liked && (
            <div className="mb-4">
              <p className="section-label mb-2">Понравилось</p>
              <p className="text-sm text-ink-700">{record.liked}</p>
            </div>
          )}

          {record.disliked && (
            <div className="mb-4">
              <p className="section-label mb-2">Не понравилось</p>
              <p className="text-sm text-ink-700">{record.disliked}</p>
            </div>
          )}

          {record.note && (
            <div className="mb-6">
              <p className="section-label mb-2">Заметки</p>
              <p className="text-sm text-ink-700">{record.note}</p>
            </div>
          )}

          <p className="section-label mb-3">Бариста</p>
          <div className="mb-6">
            <p className="text-sm text-ink-900 mb-2">{barista?.name ?? 'Не указан'}</p>
            {record.baristaRating > 0 && (
              <div className="mb-2">
                <StarRating
                  value={record.baristaRating}
                  label={`Оценка бариста ${record.baristaRating} из 5`}
                />
              </div>
            )}
            {record.baristaNote && <p className="text-sm text-ink-700">{record.baristaNote}</p>}
          </div>

          <p className="section-label mb-3">Происхождение и обжарка</p>
          <ProducerRoasterCard lot={lot} />
        </div>
      </div>

      {adaptingFrom !== undefined && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40"
          onClick={() => setAdaptingFrom(undefined)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Мой рецепт"
            onClick={(event) => event.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md bg-parchment-100 p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <h2 className="font-display text-xl text-ink-900">Мой рецепт</h2>
              <button
                type="button"
                onClick={() => setAdaptingFrom(undefined)}
                aria-label="Закрыть"
                className="text-ink-400 text-2xl leading-none px-1 shrink-0"
              >
                ×
              </button>
            </div>
            <EnthusiastRecipeForm
              lot={lot}
              currentUserId={currentUserId}
              currentUserName="Вы"
              sourceRecipe={adaptingFrom ?? undefined}
              onSave={handleSaveAdapted}
              onCancel={() => setAdaptingFrom(undefined)}
            />
          </div>
        </div>
      )}
    </>
  );
}
