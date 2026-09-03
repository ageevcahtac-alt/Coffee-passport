'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useKitchenRecipes } from '@/lib/data/useKitchenRecipes';
import { addKitchenRecipe, deleteKitchenRecipe, updateKitchenRecipe } from '@/lib/data/kitchenRecipesStore';
import { KitchenRecipeForm, type KitchenRecipeFormValues } from '@/components/kitchen/KitchenRecipeForm';
import { KitchenRecipeCard } from '@/components/kitchen/KitchenRecipeCard';
import type { KitchenRecipe } from '@/lib/types/kitchen';

type Filter = 'all' | 'top';

// "Мои рецепты" (Coffee Kitchen) — brewing-parameter log, was "My Taste"'s
// single page. See lib/types/kitchen.ts — KitchenRecipe (was HomeRecipe).
export default function MyRecipesPage() {
  const { userId, ready } = useCurrentUser();
  const recipes = useKitchenRecipes().filter((recipe) => recipe.userId === userId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<KitchenRecipe | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  if (!ready || !userId) return null;

  const shownRecipes = filter === 'top' ? recipes.filter((recipe) => recipe.isTop) : recipes;

  function handleSave(values: KitchenRecipeFormValues) {
    if (!userId) return;
    if (editingRecipe) {
      updateKitchenRecipe(editingRecipe.id, values);
    } else {
      addKitchenRecipe(values, userId);
    }
    setFormOpen(false);
    setEditingRecipe(null);
  }

  function startEdit(recipe: KitchenRecipe) {
    setEditingRecipe(recipe);
    setFormOpen(true);
  }

  function startCreate() {
    setEditingRecipe(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRecipe(null);
  }

  return (
    <div>
      {!formOpen && (
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4 mb-10
                     hover:bg-ink-800 transition-colors"
        >
          + Новый рецепт
        </button>
      )}

      {formOpen && (
        <div className="mb-10 reveal-fade">
          <KitchenRecipeForm initial={editingRecipe ?? undefined} onSave={handleSave} onCancel={closeForm} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="section-label flex-1">Мои рецепты</p>
        <div className="flex items-center rounded-md border border-ink-200 overflow-hidden text-xs shrink-0">
          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`px-3 py-1.5 transition-colors ${
              filter === 'all' ? 'bg-ink-900 text-parchment-100' : 'bg-parchment-200 text-ink-700'
            }`}
          >
            Все
          </button>
          <button
            type="button"
            onClick={() => setFilter('top')}
            aria-pressed={filter === 'top'}
            className={`px-3 py-1.5 transition-colors ${
              filter === 'top' ? 'bg-ink-900 text-parchment-100' : 'bg-parchment-200 text-ink-700'
            }`}
          >
            ★ Мой топ
          </button>
        </div>
      </div>

      {shownRecipes.length === 0 ? (
        <p className="text-sm text-ink-400">
          {recipes.length === 0
            ? 'Рецептов пока нет — добавьте первый выше.'
            : 'В «Моём топе» пока пусто — отметьте удачный рецепт флагом на его карточке.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shownRecipes.map((recipe) => (
            <KitchenRecipeCard
              key={recipe.id}
              recipe={recipe}
              currentUserId={userId}
              onEdit={() => startEdit(recipe)}
              onDelete={() => deleteKitchenRecipe(recipe.id)}
              onToggleTop={() => updateKitchenRecipe(recipe.id, { isTop: !recipe.isTop })}
              onTogglePublic={() => updateKitchenRecipe(recipe.id, { isPublic: !recipe.isPublic })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
