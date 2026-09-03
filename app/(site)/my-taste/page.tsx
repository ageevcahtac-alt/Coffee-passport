'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useHomeRecipes } from '@/lib/data/useHomeRecipes';
import { addHomeRecipe, deleteHomeRecipe, updateHomeRecipe } from '@/lib/data/homeRecipesStore';
import { HomeRecipeForm, type HomeRecipeFormValues } from '@/components/coffee/HomeRecipeForm';
import { HomeRecipeCard } from '@/components/coffee/HomeRecipeCard';
import type { HomeRecipe } from '@/lib/types/coffee';

type Filter = 'all' | 'top';

// "My Taste" — the enthusiast's Home Brew Lab: a fully standalone space for
// logging and iterating on home-brewing recipes, entirely independent of
// /journey's venue check-in history (see lib/types/coffee.ts — HomeRecipe).
export default function MyTastePage() {
  const { userId, ready } = useCurrentUser();
  const recipes = useHomeRecipes().filter((recipe) => recipe.userId === userId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<HomeRecipe | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  if (!ready || !userId) return null;

  const shownRecipes = filter === 'top' ? recipes.filter((recipe) => recipe.isTop) : recipes;

  function handleSave(values: HomeRecipeFormValues) {
    if (!userId) return;
    if (editingRecipe) {
      updateHomeRecipe(editingRecipe.id, values);
    } else {
      addHomeRecipe(values, userId);
    }
    setFormOpen(false);
    setEditingRecipe(null);
  }

  function startEdit(recipe: HomeRecipe) {
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
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">Вы</p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">🧪 My Taste — домашняя лаборатория</h1>
        <p className="text-sm text-ink-500 mb-6">
          Полностью автономное пространство для домашних экспериментов — не связано с посещением кофеен.
          Записывайте оборудование, параметры пролива и то, как вкус меняется при подстройке.
        </p>

        <Link
          href="/my-taste/equipment"
          className="inline-flex items-center justify-center w-full rounded-md border border-ink-200
                     text-ink-700 font-body font-medium text-sm px-6 py-3.5 mb-6
                     hover:bg-parchment-300 transition-colors"
        >
          ⚙ Моё оборудование
        </Link>

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
            <HomeRecipeForm initial={editingRecipe ?? undefined} onSave={handleSave} onCancel={closeForm} />
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
          <p className="text-sm text-ink-400 mb-8">
            {recipes.length === 0
              ? 'Рецептов пока нет — добавьте первый выше.'
              : 'В «Моём топе» пока пусто — отметьте удачный рецепт флагом на его карточке.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3 mb-8">
            {shownRecipes.map((recipe) => (
              <HomeRecipeCard
                key={recipe.id}
                recipe={recipe}
                currentUserId={userId}
                onEdit={() => startEdit(recipe)}
                onDelete={() => deleteHomeRecipe(recipe.id)}
                onToggleTop={() => updateHomeRecipe(recipe.id, { isTop: !recipe.isTop })}
                onTogglePublic={() => updateHomeRecipe(recipe.id, { isPublic: !recipe.isPublic })}
              />
            ))}
          </div>
        )}

        <Link href="/journey" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
          ← Моё кофейное путешествие
        </Link>
      </div>
    </main>
  );
}
