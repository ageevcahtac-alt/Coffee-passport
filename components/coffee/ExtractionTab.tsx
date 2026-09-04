'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrewingRecipe, Lot } from '@/lib/types/coffee';
import { COMMUNITY_TOP_MIN_NET_VOTES, COMMUNITY_TOP_SLOTS } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addRecipeAsDraft, publishRecipe, updateBrewingRecipe, deleteBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { getNetVotes } from '@/lib/data/recipeVotesStore';
import { useCustomBrewMethods } from '@/lib/data/useCustomBrewMethods';
import { syncCustomBrewMethodsFromSupabase } from '@/lib/data/customBrewMethodsStore';
import { resolveBrewMethodLabel } from '@/lib/utils/resolveBrewMethodLabel';
import { RecipeCard } from '@/components/coffee/RecipeCard';
import { RecipeCompare } from '@/components/coffee/RecipeCompare';
import { EnthusiastRecipeForm } from '@/components/coffee/EnthusiastRecipeForm';

type ScopeTab = 'mine' | 'roaster' | 'shop' | 'barista' | 'all';

const SCOPE_TABS: { id: ScopeTab; label: string }[] = [
  { id: 'mine', label: 'Мои рецепты' },
  { id: 'roaster', label: 'От обжарщиков' },
  { id: 'shop', label: 'От кофеен' },
  { id: 'barista', label: 'От бариста' },
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
  const customBrewMethods = useCustomBrewMethods();

  // A recipe's brewingMethodId can now be a legacy BrewingMethodId, one of
  // STANDARD_BREW_METHOD_CATEGORIES, or a custom method id — the label for
  // whichever one actually appears is resolved via resolveBrewMethodLabel
  // rather than assuming any one fixed list (see that helper's own comment
  // on why: filtering against the old BREWING_METHODS array here used to
  // silently hide any recipe tagged with a new category or custom id).
  const methodsWithRecipes = useMemo(
    () => Array.from(new Set(allRecipes.map((recipe) => recipe.brewingMethodId))),
    [allRecipes]
  );

  // Best-effort warm-up so resolveBrewMethodLabel below can resolve a
  // custom method id to its real name instead of falling back to the raw
  // id — custom methods aren't globally synced (see
  // customBrewMethodsStore.ts's own header), so whichever authors show up
  // among this lot's recipes get synced on demand here.
  useEffect(() => {
    const owners = new Map<string, 'barista' | 'enthusiast'>();
    for (const recipe of allRecipes) {
      if (recipe.authorType === 'barista' || recipe.authorType === 'enthusiast') {
        owners.set(recipe.authorId, recipe.authorType);
      }
    }
    owners.forEach((ownerType, ownerId) => {
      void syncCustomBrewMethodsFromSupabase(ownerType, ownerId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-derive the owner set when the recipe count for this lot changes, not on every store tick
  }, [lot.id, allRecipes.length]);

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  useEffect(() => {
    if (selectedMethod === null && methodsWithRecipes.length > 0) {
      setSelectedMethod(methodsWithRecipes[0]);
    }
  }, [methodsWithRecipes, selectedMethod]);

  const [scopeTab, setScopeTab] = useState<ScopeTab>('all');
  const [adaptingRecipe, setAdaptingRecipe] = useState<BrewingRecipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<BrewingRecipe | null>(null);
  const [loggingStandalone, setLoggingStandalone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const forMethod = selectedMethod ? allRecipes.filter((recipe) => recipe.brewingMethodId === selectedMethod) : [];
  const benchmarkRecipes = forMethod.filter((recipe) => recipe.authorType === 'roaster');
  const shopRecipes = [...forMethod.filter((recipe) => recipe.authorType === 'coffee_shop')].sort((a, b) => {
    if (a.authorId === coffeeShopId && b.authorId !== coffeeShopId) return -1;
    if (b.authorId === coffeeShopId && a.authorId !== coffeeShopId) return 1;
    return 0;
  });
  // isPublic guard added now that barista recipes have a draft state too
  // (they used to always be isPublic: true — see ProRecipeForm's own note
  // on why that changed): without it, an unpublished draft would leak to
  // every guest browsing this lot, not just its own author.
  const baristaRecipes = forMethod.filter((recipe) => recipe.authorType === 'barista' && recipe.isPublic);
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

  // Editing an existing recipe updates it in place; a fresh save always
  // inserts as a draft first (quota-checked, see RecipeQuotaPanel inside
  // EnthusiastRecipeForm) — the form's own "Опубликовать" checkbox (input.
  // isPublic) then only attempts an actual publish afterwards, subject to
  // the per-method cooldown. A cooldown rejection there doesn't undo the
  // successful draft save, it's surfaced separately.
  async function handleSaveEnthusiastRecipe(input: Omit<BrewingRecipe, 'id' | 'createdAt'>) {
    setActionError(null);

    if (editingRecipe) {
      const { error } = await updateBrewingRecipe({ ...editingRecipe, ...input });
      if (error) {
        setActionError(error);
        return;
      }
      setEditingRecipe(null);
      return;
    }

    const { isPublic: publishNow, ...draftInput } = input;
    const { recipe, error } = await addRecipeAsDraft(draftInput);
    if (error || !recipe) {
      setActionError(error ?? 'Не удалось сохранить рецепт.');
      return;
    }

    if (publishNow) {
      const publishResult = await publishRecipe(recipe.id);
      if (publishResult.error) {
        setActionError(`Черновик сохранён. ${publishResult.error}`);
      }
    }

    setAdaptingRecipe(null);
    setLoggingStandalone(false);
  }

  async function handlePublish(recipe: BrewingRecipe) {
    setActionError(null);
    setPublishingId(recipe.id);
    const { error } = await publishRecipe(recipe.id);
    setPublishingId(null);
    if (error) setActionError(error);
  }

  async function handleDelete(recipe: BrewingRecipe) {
    setActionError(null);
    setDeletingId(recipe.id);
    const { error } = await deleteBrewingRecipe(recipe.id);
    setDeletingId(null);
    if (error) setActionError(error);
  }

  return (
    <div>
      <p className="section-label mb-4">Способ приготовления</p>
      {methodsWithRecipes.length === 0 ? (
        <p className="text-sm text-ink-400">
          Для этого лота пока нет рецептов — запишите первый ниже.
        </p>
      ) : (
        <div role="tablist" aria-label="Способ приготовления" className="flex flex-wrap gap-2">
          {methodsWithRecipes.map((methodId) => (
            <button
              key={methodId}
              type="button"
              role="tab"
              aria-selected={selectedMethod === methodId}
              onClick={() => setSelectedMethod(methodId)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors
                          ${selectedMethod === methodId
                            ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                            : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
            >
              {resolveBrewMethodLabel(methodId, customBrewMethods)}
            </button>
          ))}
        </div>
      )}

      {actionError && (
        <p className="mt-3 text-xs text-rating">{actionError}</p>
      )}

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
                      onEdit={setEditingRecipe}
                      onPublish={handlePublish}
                      onDelete={handleDelete}
                      publishingId={publishingId}
                      deletingId={deletingId}
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

            {scopeTab === 'barista' && (
              <RecipeGroup
                title="От бариста"
                recipes={baristaRecipes}
                currentUserId={currentUserId}
                onAdapt={setAdaptingRecipe}
                emptyText="Ни один бариста ещё не опубликовал рекомендацию для этого метода."
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
                  title="От бариста"
                  recipes={baristaRecipes}
                  currentUserId={currentUserId}
                  onAdapt={setAdaptingRecipe}
                  emptyText="Ни один бариста ещё не опубликовал рекомендацию для этого метода."
                />
                <RecipeGroup
                  title="Рецепты сообщества"
                  recipes={communityRecipes}
                  currentUserId={currentUserId}
                  onAdapt={setAdaptingRecipe}
                  onEdit={setEditingRecipe}
                  onPublish={handlePublish}
                  onDelete={handleDelete}
                  publishingId={publishingId}
                  deletingId={deletingId}
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

      {(adaptingRecipe || loggingStandalone || editingRecipe) && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
          onClick={() => {
            setAdaptingRecipe(null);
            setLoggingStandalone(false);
            setEditingRecipe(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Мой рецепт"
            onClick={(event) => event.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md bg-parchment-100 p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <h2 className="font-display text-xl text-ink-900">{editingRecipe ? 'Редактировать рецепт' : 'Мой рецепт'}</h2>
              <button
                type="button"
                onClick={() => {
                  setAdaptingRecipe(null);
                  setLoggingStandalone(false);
                  setEditingRecipe(null);
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
              editingRecipe={editingRecipe ?? undefined}
              onSave={handleSaveEnthusiastRecipe}
              onCancel={() => {
                setAdaptingRecipe(null);
                setLoggingStandalone(false);
                setEditingRecipe(null);
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
  onEdit,
  onPublish,
  onDelete,
  publishingId,
  deletingId,
}: {
  recipe: BrewingRecipe;
  benchmark: BrewingRecipe | null;
  currentUserId: string;
  onAdapt: (recipe: BrewingRecipe) => void;
  onEdit: (recipe: BrewingRecipe) => void;
  onPublish: (recipe: BrewingRecipe) => void;
  onDelete: (recipe: BrewingRecipe) => void;
  publishingId: string | null;
  deletingId: string | null;
}) {
  const [comparing, setComparing] = useState(false);

  return (
    <div>
      <RecipeCard
        recipe={recipe}
        currentUserId={currentUserId}
        onAdapt={onAdapt}
        onEdit={onEdit}
        onPublish={onPublish}
        onDelete={onDelete}
        publishing={publishingId === recipe.id}
        deleting={deletingId === recipe.id}
      />
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
  onEdit,
  onPublish,
  onDelete,
  publishingId,
  deletingId,
  emptyText,
  topRecipeIds,
}: {
  title: string;
  recipes: BrewingRecipe[];
  currentUserId: string;
  onAdapt: (recipe: BrewingRecipe) => void;
  onEdit?: (recipe: BrewingRecipe) => void;
  onPublish?: (recipe: BrewingRecipe) => void;
  onDelete?: (recipe: BrewingRecipe) => void;
  publishingId?: string | null;
  deletingId?: string | null;
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
              onEdit={onEdit}
              onPublish={onPublish}
              onDelete={onDelete}
              publishing={publishingId === recipe.id}
              deleting={deletingId === recipe.id}
              isCommunityTop={topRecipeIds?.has(recipe.id) ?? false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
