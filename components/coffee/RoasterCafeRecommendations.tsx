'use client';

import { useState } from 'react';
import type { BrewingMethodId, BrewingRecipe, Lot, Roaster } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getBaristaById } from '@/lib/data/baristas';
import { RecipeCard } from '@/components/coffee/RecipeCard';
import { EnthusiastRecipeForm } from '@/components/coffee/EnthusiastRecipeForm';

// Always-both-visible comparison for the currently selected brewing
// method: the roaster's own official recipe, this specific coffee shop's
// own adaptation, and — when the guest's checked-in cup names one — that
// barista's own recommendation. Each card shows the full equipment/setup
// rundown (grinder, water, dose/yield/time/TDS — all already part of
// RecipeCard) and its own Like/Dislike (via RecipeCard's isVotable).
// Replaces the old single "featured recipe" card (whichever of
// roaster/shop/community happened to win a fallback chain, sometimes
// badged "Рецепт сообщества" when neither an official nor shop recipe
// existed) that used to live in TastingDetailModal.
export function RoasterCafeRecommendations({
  lot,
  roaster,
  shopId,
  baristaId,
  brewingMethodId,
  currentUserId,
  currentUserName,
}: {
  lot: Lot;
  roaster: Roaster;
  shopId: string | null;
  // The specific barista from this guest's own check-in, if any — a
  // barista's recommendation is personal, not shop-wide, so this card is
  // scoped to exactly the person who made this cup.
  baristaId?: string | null;
  brewingMethodId: BrewingMethodId;
  currentUserId: string;
  currentUserName: string;
}) {
  const recipesForMethod = useBrewingRecipes().filter(
    (recipe) => recipe.lotId === lot.id && recipe.brewingMethodId === brewingMethodId
  );
  const roasterRecipe =
    recipesForMethod.find((recipe) => recipe.authorType === 'roaster' && recipe.isBenchmark) ??
    recipesForMethod.find((recipe) => recipe.authorType === 'roaster') ??
    null;
  const shopRecipe = shopId
    ? recipesForMethod.find((recipe) => recipe.authorType === 'coffee_shop' && recipe.authorId === shopId) ?? null
    : null;
  const baristaRecipe = baristaId
    ? recipesForMethod.find((recipe) => recipe.authorType === 'barista' && recipe.authorId === baristaId) ?? null
    : null;
  const shop = shopId ? getCoffeeShopById(shopId) : undefined;
  const barista = baristaId ? getBaristaById(baristaId) : undefined;

  // undefined = closed; null = standalone "log my own" (no source); a
  // BrewingRecipe = adapting from that specific recipe.
  const [formSource, setFormSource] = useState<BrewingRecipe | null | undefined>(undefined);

  function handleSave(input: Omit<BrewingRecipe, 'id' | 'createdAt'>) {
    addBrewingRecipe(input);
    setFormSource(undefined);
  }

  if (!roasterRecipe && !shopRecipe && !baristaRecipe) {
    return (
      <p className="text-sm text-ink-400">
        Для этого способа пока нет рекомендаций от обжарщика, кофейни или бариста — станьте первым.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mb-2">Рекомендация обжарщика</p>
          {roasterRecipe ? (
            <RecipeCard
              recipe={roasterRecipe}
              currentUserId={currentUserId}
              onAdapt={(recipe) => setFormSource(recipe)}
              titleOverride={`Рекомендация обжарщика · ${roaster.name}`}
            />
          ) : (
            <p className="text-sm text-ink-400">Обжарщик ещё не опубликовал рецепт для этого способа.</p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mb-2">Рекомендация кофейни</p>
          {shopRecipe ? (
            <RecipeCard
              recipe={shopRecipe}
              currentUserId={currentUserId}
              onAdapt={(recipe) => setFormSource(recipe)}
              titleOverride={`Рекомендация кофейни · ${shop?.name ?? shopRecipe.authorName}`}
            />
          ) : (
            <p className="text-sm text-ink-400">
              {shop?.name ?? 'Эта кофейня'} ещё не опубликовала свою адаптацию для этого способа.
            </p>
          )}
        </div>
        {baristaId && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-widest2 text-ink-400 mb-2">Рекомендация бариста</p>
            {baristaRecipe ? (
              <RecipeCard
                recipe={baristaRecipe}
                currentUserId={currentUserId}
                onAdapt={(recipe) => setFormSource(recipe)}
                titleOverride={`Рекомендация бариста · ${barista?.name ?? baristaRecipe.authorName}`}
              />
            ) : (
              <p className="text-sm text-ink-400">
                {barista?.name ?? 'Этот бариста'} ещё не опубликовал(а) свою рекомендацию для этого способа.
              </p>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setFormSource(null)}
        className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-5"
      >
        + Записать свой рецепт
      </button>

      {formSource !== undefined && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
          onClick={() => setFormSource(undefined)}
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
                onClick={() => setFormSource(undefined)}
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
              sourceRecipe={formSource ?? undefined}
              onSave={handleSave}
              onCancel={() => setFormSource(undefined)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
