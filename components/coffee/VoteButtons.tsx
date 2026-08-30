'use client';

import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { castVote, getNetVotes, getUserVote } from '@/lib/data/recipeVotesStore';

// 👍/👎 pair for a public Community Brew — see RecipeCard.tsx, which
// renders this only for authorType 'enthusiast' recipes with isPublic
// true (voting is a Community Brews concept, not applied to official
// roaster/coffee-shop recipes).
export function VoteButtons({ recipeId, currentUserId }: { recipeId: string; currentUserId: string }) {
  const votes = useRecipeVotes();
  const net = getNetVotes(recipeId, votes);
  const myVote = getUserVote(recipeId, currentUserId, votes);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => castVote(recipeId, currentUserId, 1)}
        aria-pressed={myVote === 1}
        className={`text-sm px-2 py-1 rounded-md transition-colors ${
          myVote === 1 ? 'bg-moss-100 text-moss-700' : 'text-ink-400 hover:text-ink-900'
        }`}
      >
        👍
      </button>
      <span className="data-value text-xs text-ink-500">{net}</span>
      <button
        type="button"
        onClick={() => castVote(recipeId, currentUserId, -1)}
        aria-pressed={myVote === -1}
        className={`text-sm px-2 py-1 rounded-md transition-colors ${
          myVote === -1 ? 'bg-ink-100 text-ink-900' : 'text-ink-400 hover:text-ink-900'
        }`}
      >
        👎
      </button>
    </div>
  );
}
