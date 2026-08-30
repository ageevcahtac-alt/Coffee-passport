'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrewingMethodId, BrewingRecipe, Lot } from '@/lib/types/coffee';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { getNetVotes } from '@/lib/data/recipeVotesStore';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';
import { RecipeCard } from '@/components/coffee/RecipeCard';
import { EnthusiastRecipeForm } from '@/components/coffee/EnthusiastRecipeForm';

export function ExtractionTab({
  lot,
  currentUserId,
  currentUserName,
}: {
  lot: Lot;
  currentUserId: string;
  currentUserName: string;
}) {
  const allRecipes = useBrewingRecipes().filter((recipe) => recipe.lotId === lot.id);
  const votes = useRecipeVotes();

  const methodsWithRecipes = useMemo(() => {
    const ids = new Set(allRecipes.map((recipe) => recipe.brewingMethodId));
    return BREWING_METHODS.filter((method) => ids.has(method.id)).map((method) => method.id);
  }, [allRecipes]);

  const [selectedMethod, setSelectedMethod] = useState<BrewingMethodId | null>(null);
  useEffect(() => {
    if (selectedMethod === null && methodsWithRecipes.length > 0) {
      setSelectedMethod(methodsWithRecipes[0]);
    }
  }, [methodsWithRecipes, selectedMethod]);

  const [adaptingRecipe, setAdaptingRecipe] = useState<BrewingRecipe | null>(null);
  const [loggingStandalone, setLoggingStandalone] = useState(false);

  const forMethod = selectedMethod ? allRecipes.filter((recipe) => recipe.brewingMethodId === selectedMethod) : [];
  const benchmarkRecipes = forMethod.filter((recipe) => recipe.authorType === 'roaster');
  const shopRecipes = forMethod.filter((recipe) => recipe.authorType === 'coffee_shop');
  // Only opted-in ("Опубликовать рецепт...") enthusiast recipes show here —
  // an unpublished personal log stays visible only to its author, via
  // MyRecipesShelf on /journey. Community Choice picks (see
  // components/coffee/CommunityHighlights.tsx) pin to the top, then by net
  // votes, then newest first.
  const communityRecipes = forMethod
    .filter((recipe) => recipe.authorType === 'enthusiast' && recipe.isPublic)
    .sort((a, b) => {
      if (a.communityChoice !== b.communityChoice) return a.communityChoice ? -1 : 1;
      const voteDelta = getNetVotes(b.id, votes) - getNetVotes(a.id, votes);
      if (voteDelta !== 0) return voteDelta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  function handleSaveEnthusiastRecipe(input: Omit<BrewingRecipe, 'id' | 'createdAt'>) {
    addBrewingRecipe(input);
    setAdaptingRecipe(null);
    setLoggingStandalone(false);
  }

  return (
    <div>
      <p className="section-label mb-4">Способ приготовления</p>
      <BrewingMethodSelector value={selectedMethod} onChange={setSelectedMethod} />

      {selectedMethod && (
        <div className="mt-8 flex flex-col gap-8">
          <RecipeGroup
            title="Официальный бенчмарк"
            recipes={benchmarkRecipes}
            currentUserId={currentUserId}
            onAdapt={setAdaptingRecipe}
            emptyText="Обжарщик ещё не опубликовал рецепт для этого метода."
          />
          <RecipeGroup
            title="Кофейни"
            recipes={shopRecipes}
            currentUserId={currentUserId}
            onAdapt={setAdaptingRecipe}
            emptyText="Пока ни одна кофейня не поделилась своей адаптацией."
          />
          <RecipeGroup
            title="Рецепты сообщества"
            recipes={communityRecipes}
            currentUserId={currentUserId}
            onAdapt={setAdaptingRecipe}
            emptyText="Пока нет опубликованных рецептов от энтузиастов — станьте первым."
          />

          <button
            type="button"
            onClick={() => setLoggingStandalone(true)}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 self-start"
          >
            + Записать свой рецепт для этого лота
          </button>
        </div>
      )}

      {(adaptingRecipe || loggingStandalone) && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
          onClick={() => {
            setAdaptingRecipe(null);
            setLoggingStandalone(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Адаптировать рецепт под себя"
            onClick={(event) => event.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md bg-parchment-100 p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <h2 className="font-display text-xl text-ink-900">Мой рецепт</h2>
              <button
                type="button"
                onClick={() => {
                  setAdaptingRecipe(null);
                  setLoggingStandalone(false);
                }}
                aria-label="Закрыть"
                className="text-ink-400 text-2xl leading-none px-1 shrink-0"
              >
                ×
              </button>
            </div>
            <EnthusiastRecipeForm
              lot={lot}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              sourceRecipe={adaptingRecipe ?? undefined}
              onSave={handleSaveEnthusiastRecipe}
              onCancel={() => {
                setAdaptingRecipe(null);
                setLoggingStandalone(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RecipeGroup({
  title,
  recipes,
  currentUserId,
  onAdapt,
  emptyText,
}: {
  title: string;
  recipes: BrewingRecipe[];
  currentUserId: string;
  onAdapt: (recipe: BrewingRecipe) => void;
  emptyText: string;
}) {
  return (
    <div>
      <p className="section-label mb-4">{title}</p>
      {recipes.length === 0 ? (
        <p className="text-sm text-ink-400">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} currentUserId={currentUserId} onAdapt={onAdapt} />
          ))}
        </div>
      )}
    </div>
  );
}
