'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrewingMethodId, BrewingRecipe, Lot } from '@/lib/types/coffee';
import { BREWING_METHODS, COMMUNITY_TOP_MIN_NET_VOTES, COMMUNITY_TOP_SLOTS } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { getNetVotes } from '@/lib/data/recipeVotesStore';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';
import { RecipeCard } from '@/components/coffee/RecipeCard';
import { RecipeCompare } from '@/components/coffee/RecipeCompare';
import { EnthusiastRecipeForm } from '@/components/coffee/EnthusiastRecipeForm';

type ScopeTab = 'mine' | 'roaster' | 'shop' | 'all';

const SCOPE_TABS: { id: ScopeTab; label: string }[] = [
  { id: 'mine', label: 'Мои рецепты' },
  { id: 'roaster', label: 'От обжарщиков' },
  { id: 'shop', label: 'От кофеен' },
  { id: 'all', label: 'Все' },
];

export function ExtractionTab({
  lot,
  currentUserId,
  currentUserName,
  coffeeShopId,
}: {
  lot: Lot;
  currentUserId: string;
  currentUserName: string;
  // The guest's own checked-in shop, if any — surfaces that shop's own
  // recipe first within "От кофеен" instead of leaving list order
  // (creation time) to bury it among every other shop's recipes.
  coffeeShopId?: string | null;
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

  const [scopeTab, setScopeTab] = useState<ScopeTab>('all');
  const [adaptingRecipe, setAdaptingRecipe] = useState<BrewingRecipe | null>(null);
  const [loggingStandalone, setLoggingStandalone] = useState(false);

  const forMethod = selectedMethod ? allRecipes.filter((recipe) => recipe.brewingMethodId === selectedMethod) : [];
  const benchmarkRecipes = forMethod.filter((recipe) => recipe.authorType === 'roaster');
  const shopRecipes = [...forMethod.filter((recipe) => recipe.authorType === 'coffee_shop')].sort((a, b) => {
    if (a.authorId === coffeeShopId && b.authorId !== coffeeShopId) return -1;
    if (b.authorId === coffeeShopId && a.authorId !== coffeeShopId) return 1;
    return 0;
  });
  // "Мои рецепты" — every recipe this user is the author of for this
  // method, published or not (an unpublished personal log is otherwise
  // only visible via MyRecipesShelf on /journey — this tab is the other
  // place it should surface, scoped to this one lot).
  const myRecipes = forMethod
    .filter((recipe) => recipe.authorType === 'enthusiast' && recipe.authorId === currentUserId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // Only opted-in ("Опубликовать рецепт...") enthusiast recipes show in the
  // community/"Все" groups — an unpublished personal log stays visible only
  // to its author (MyRecipesShelf on /journey, or the "Мои рецепты" tab
  // above). Sorted purely by net votes (👍 minus 👎), then newest first —
  // no manual curation, so ranking always reflects live community sentiment.
  const communityRecipes = forMethod
    .filter((recipe) => recipe.authorType === 'enthusiast' && recipe.isPublic)
    .sort((a, b) => {
      const voteDelta = getNetVotes(b.id, votes) - getNetVotes(a.id, votes);
      if (voteDelta !== 0) return voteDelta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // The top COMMUNITY_TOP_SLOTS recipes by that same sort qualify for the
  // "🔥 Топ сообщества" badge only once they clear COMMUNITY_TOP_MIN_NET_VOTES
  // — a recipe with 1 net vote never gets pinned just for being first.
  const communityTopIds = new Set(
    communityRecipes.slice(0, COMMUNITY_TOP_SLOTS).filter((recipe) => getNetVotes(recipe.id, votes) >= COMMUNITY_TOP_MIN_NET_VOTES).map((recipe) => recipe.id)
  );

  // What a "Мои рецепты" card compares itself against — the roaster's
  // official benchmark for this same method, if one's been published.
  const benchmarkForCompare = benchmarkRecipes[0] ?? null;

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
        <div className="mt-8">
          <div role="tablist" aria-label="Рецепты" className="flex flex-wrap gap-1.5 mb-6">
            {SCOPE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={scopeTab === tab.id}
                onClick={() => setScopeTab(tab.id)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors
                            ${scopeTab === tab.id
                              ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                              : 'border-ink-200 text-ink-500'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-8">
            {scopeTab === 'mine' && (
              myRecipes.length === 0 ? (
                <p className="text-sm text-ink-400">
                  У вас пока нет рецепта для этого способа — запишите свой ниже.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {myRecipes.map((recipe) => (
                    <MyRecipeWithCompare
                      key={recipe.id}
                      recipe={recipe}
                      benchmark={benchmarkForCompare}
                      currentUserId={currentUserId}
                      onAdapt={setAdaptingRecipe}
                    />
                  ))}
                </div>
              )
            )}

            {scopeTab === 'roaster' && (
              <RecipeGroup
                title="От обжарщиков"
                recipes={benchmarkRecipes}
                currentUserId={currentUserId}
                onAdapt={setAdaptingRecipe}
                emptyText="Обжарщик ещё не опубликовал рецепт для этого метода."
              />
            )}

            {scopeTab === 'shop' && (
              <RecipeGroup
                title="От кофеен"
                recipes={shopRecipes}
                currentUserId={currentUserId}
                onAdapt={setAdaptingRecipe}
                emptyText="Пока ни одна кофейня не поделилась своей адаптацией."
              />
            )}

            {scopeTab === 'all' && (
              <>
                <RecipeGroup
                  title="От обжарщиков"
                  recipes={benchmarkRecipes}
                  currentUserId={currentUserId}
                  onAdapt={setAdaptingRecipe}
                  emptyText="Обжарщик ещё не опубликовал рецепт для этого метода."
                />
                <RecipeGroup
                  title="От кофеен"
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
                  topRecipeIds={communityTopIds}
                />
              </>
            )}

            <button
              type="button"
              onClick={() => setLoggingStandalone(true)}
              className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 self-start"
            >
              + Записать свой рецепт для этого лота
            </button>
          </div>
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

function MyRecipeWithCompare({
  recipe,
  benchmark,
  currentUserId,
  onAdapt,
}: {
  recipe: BrewingRecipe;
  benchmark: BrewingRecipe | null;
  currentUserId: string;
  onAdapt: (recipe: BrewingRecipe) => void;
}) {
  const [comparing, setComparing] = useState(false);

  return (
    <div>
      <RecipeCard recipe={recipe} currentUserId={currentUserId} onAdapt={onAdapt} />
      {benchmark && (
        <button
          type="button"
          onClick={() => setComparing((prev) => !prev)}
          className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-2"
        >
          {comparing ? 'Скрыть сравнение с обжарщиком' : '⇄ Сравнить с бенчмарком обжарщика'}
        </button>
      )}
      {comparing && benchmark && <RecipeCompare mine={recipe} benchmark={benchmark} />}
    </div>
  );
}

function RecipeGroup({
  title,
  recipes,
  currentUserId,
  onAdapt,
  emptyText,
  topRecipeIds,
}: {
  title: string;
  recipes: BrewingRecipe[];
  currentUserId: string;
  onAdapt: (recipe: BrewingRecipe) => void;
  emptyText: string;
  topRecipeIds?: Set<string>;
}) {
  return (
    <div>
      <p className="section-label mb-4">{title}</p>
      {recipes.length === 0 ? (
        <p className="text-sm text-ink-400">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              currentUserId={currentUserId}
              onAdapt={onAdapt}
              isCommunityTop={topRecipeIds?.has(recipe.id) ?? false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
