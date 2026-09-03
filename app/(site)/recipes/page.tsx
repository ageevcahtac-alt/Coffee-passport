'use client';

import Link from 'next/link';
import { COMMUNITY_TOP_MIN_NET_VOTES, COMMUNITY_TOP_SLOTS } from '@/lib/types/coffee';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useHomeRecipes } from '@/lib/data/useHomeRecipes';
import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { getNetVotes } from '@/lib/data/recipeVotesStore';
import { HomeRecipeCard } from '@/components/coffee/HomeRecipeCard';

// Community Recipes Board — every Home Brew Lab recipe (see /my-taste) an
// enthusiast opted to share ("Поделиться с сообществом"), ranked by live
// 👍/👎 votes. Same algorithmic-only "top" rule as the per-lot "🔥 Топ
// сообщества" badge (see ExtractionTab.tsx) and the professional /top-recipes
// leaderboard — no manual curation, top spots are earned purely by net votes.
export default function CommunityRecipesPage() {
  const { userId } = useCurrentUser();
  const currentUserId = userId ?? '';
  const recipes = useHomeRecipes().filter((recipe) => recipe.isPublic);
  const votes = useRecipeVotes();

  const ranked = [...recipes].sort((a, b) => {
    const voteDelta = getNetVotes(b.id, votes) - getNetVotes(a.id, votes);
    if (voteDelta !== 0) return voteDelta;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const top3 = ranked.filter((recipe) => getNetVotes(recipe.id, votes) >= COMMUNITY_TOP_MIN_NET_VOTES).slice(0, COMMUNITY_TOP_SLOTS);
  const topIds = new Set(top3.map((recipe) => recipe.id));
  const rest = ranked.filter((recipe) => !topIds.has(recipe.id));

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="section-label mb-2">Топовые рецепты</p>
        <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-3">Рецепты сообщества</h1>
        <p className="text-ink-500 text-sm mb-10">
          Домашние рецепты, которыми поделились энтузиасты из своей «My Taste» — рейтинг живой, считается по 👍/👎.
        </p>

        {ranked.length === 0 ? (
          <p className="text-sm text-ink-400 mb-8">
            Пока никто не поделился рецептом. Загляните в{' '}
            <Link href="/my-taste" className="underline underline-offset-2 hover:text-ink-900">
              My Taste
            </Link>
            , чтобы опубликовать свой первый.
          </p>
        ) : (
          <>
            {top3.length > 0 && (
              <div className="mb-10">
                <p className="section-label mb-4">🔥 Топ-3 сообщества</p>
                <div className="flex flex-col gap-3">
                  {top3.map((recipe) => (
                    <HomeRecipeCard key={recipe.id} recipe={recipe} currentUserId={currentUserId} />
                  ))}
                </div>
              </div>
            )}

            {rest.length > 0 && (
              <div>
                <p className="section-label mb-4">Все рецепты</p>
                <div className="flex flex-col gap-3">
                  {rest.map((recipe) => (
                    <HomeRecipeCard key={recipe.id} recipe={recipe} currentUserId={currentUserId} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
