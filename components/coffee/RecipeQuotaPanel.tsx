'use client';

import { useEffect, useState } from 'react';
import { RECIPE_LIMITS, type RecipeAuthorType } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { deleteBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import type { RecipePublishEventRow } from '@/lib/types/database';
import { getDraftCount, getNextPublishEligibleAt } from '@/lib/utils/recipeLimits';
import { formatTastingDate } from '@/lib/utils/date';

// Shown once a brewing method is picked in the barista/enthusiast recipe
// forms — "Черновики: X/5" with a delete-to-free-a-slot list, plus the
// publish-cooldown status. Both numbers are the client-side mirror of
// supabase/migrations/0016_recipe_quota_limits.sql's trigger (the real
// enforcement); this panel only ever reads/deletes, it never bypasses the
// trigger by writing is_public itself.
export function RecipeQuotaPanel({
  authorType,
  authorId,
  brewingMethodId,
  methodLabel,
}: {
  authorType: RecipeAuthorType;
  authorId: string;
  brewingMethodId: string;
  methodLabel: string;
}) {
  const allRecipes = useBrewingRecipes();
  const drafts = allRecipes
    .filter(
      (recipe) =>
        recipe.authorType === authorType &&
        recipe.authorId === authorId &&
        recipe.brewingMethodId === brewingMethodId &&
        !recipe.isPublic
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const draftCount = getDraftCount(allRecipes, authorType, authorId, brewingMethodId);
  const [showDrafts, setShowDrafts] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [nextEligibleAt, setNextEligibleAt] = useState<Date | null>(null);
  const [loadingCooldown, setLoadingCooldown] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingCooldown(true);
    void getBrowserSupabaseClient()
      .from('recipe_publish_events')
      .select('*')
      .eq('author_type', authorType)
      .eq('author_id', authorId)
      .eq('brewing_method_id', brewingMethodId)
      .then(({ data }) => {
        if (cancelled) return;
        const events = ((data ?? []) as RecipePublishEventRow[]).map((row) => ({
          brewingMethodId: row.brewing_method_id,
          publishedAt: row.published_at,
        }));
        setNextEligibleAt(getNextPublishEligibleAt(events, brewingMethodId));
        setLoadingCooldown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authorType, authorId, brewingMethodId]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteBrewingRecipe(id);
    setDeletingId(null);
  }

  const atDraftCap = draftCount >= RECIPE_LIMITS.maxDraftsPerMethod;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-900">
          Черновики для «{methodLabel}»:{' '}
          <strong className={atDraftCap ? 'text-rating font-medium' : 'font-medium'}>
            {draftCount}/{RECIPE_LIMITS.maxDraftsPerMethod}
          </strong>
        </p>
        {drafts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDrafts((prev) => !prev)}
            className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900 shrink-0"
          >
            {showDrafts ? 'Скрыть' : 'Показать'}
          </button>
        )}
      </div>

      {atDraftCap && (
        <p className="text-xs text-rating">
          Лимит черновиков исчерпан — удалите один из старых, чтобы создать новый.
        </p>
      )}

      {showDrafts && (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => {
            const lot = getMergedLotById(draft.lotId);
            return (
              <li
                key={draft.id}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-100 bg-parchment-200 px-3 py-2"
              >
                <span className="text-xs text-ink-700 truncate">
                  {lot?.name ?? draft.lotId} · {draft.doseG}г → {draft.yieldG}г
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(draft.id)}
                  disabled={deletingId === draft.id}
                  className="text-xs text-rating underline underline-offset-2 hover:text-ink-900 shrink-0 disabled:opacity-40"
                >
                  {deletingId === draft.id ? 'Удаление…' : 'Удалить'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-ink-200 pt-3">
        {loadingCooldown ? (
          <p className="text-xs text-ink-400">Проверка статуса публикации…</p>
        ) : nextEligibleAt ? (
          <p className="text-xs text-ink-500">
            Публикация для этого способа: следующая доступна{' '}
            <strong className="font-medium text-ink-900">{formatTastingDate(nextEligibleAt.toISOString())}</strong>
          </p>
        ) : (
          <p className="text-xs text-moss-500">Публикация для этого способа доступна.</p>
        )}
      </div>
    </div>
  );
}
