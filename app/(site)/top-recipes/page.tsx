'use client';

import Link from 'next/link';
import type { BrewingRecipe, RecipeAuthorType } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { getNetVotes } from '@/lib/data/recipeVotesStore';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { RecipeCard } from '@/components/coffee/RecipeCard';

// Three live leaderboard slots — the single most-liked published recipe
// per author category, by net votes (👍 minus 👎, see VoteButtons on every
// recommendation card). No manual curation: same algorithmic-only rule
// COMMUNITY_TOP_MIN_NET_VOTES/COMMUNITY_TOP_SLOTS already established for
// the per-lot "🔥 Топ сообщества" badge (see ExtractionTab.tsx) — this
// page is just that same idea widened to "across every lot."
const CATEGORIES: { id: RecipeAuthorType; rank: number; title: string }[] = [
  { id: 'barista', rank: 1, title: 'Выбор бариста' },
  { id: 'roaster', rank: 2, title: 'Выбор обжарщиков' },
  { id: 'enthusiast', rank: 3, title: 'Топ сообщества' },
];

function topRecipeFor(authorType: RecipeAuthorType, recipes: BrewingRecipe[], votes: ReturnType<typeof useRecipeVotes>) {
  return recipes
    .filter((recipe) => recipe.authorType === authorType && recipe.isPublic)
    .sort((a, b) => {
      const voteDelta = getNetVotes(b.id, votes) - getNetVotes(a.id, votes);
      if (voteDelta !== 0) return voteDelta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })[0];
}

export default function TopRecipesPage() {
  const recipes = useBrewingRecipes();
  const votes = useRecipeVotes();
  const { userId } = useCurrentUser();
  const currentUserId = userId ?? '';

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="section-label mb-2">Топовые рецепты</p>
        <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-3">Избранное платформы</h1>
        <p className="text-ink-500 text-sm mb-10">
          Самый залайканный рецепт в каждой категории — рейтинг живой, считается по 👍/👎 от гостей.
        </p>

        <div className="flex flex-col gap-8">
          {CATEGORIES.map((category) => {
            const recipe = topRecipeFor(category.id, recipes, votes);
            const lot = recipe ? getMergedLotById(recipe.lotId) : null;

            return (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="data-value text-sm text-gold-500 shrink-0">#{category.rank}</span>
                  <h2 className="font-display text-lg text-ink-900 leading-tight">{category.title}</h2>
                </div>

                {recipe && lot ? (
                  <>
                    <Link
                      href={`/passport/${lot.id}`}
                      className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 mb-3 inline-block"
                    >
                      {lot.name}
                    </Link>
                    <RecipeCard recipe={recipe} currentUserId={currentUserId} />
                  </>
                ) : (
                  <p className="text-sm text-ink-400">
                    Пока нет ни одного лайкнутого рецепта в этой категории — станьте первым, кто проголосует.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
