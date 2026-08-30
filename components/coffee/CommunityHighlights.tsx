'use client';

import { COMMUNITY_TOP_MIN_NET_VOTES, type Lot } from '@/lib/types/coffee';
import { useCustomDevices } from '@/lib/data/useCustomDevices';
import { approveCustomDevice } from '@/lib/data/customDevicesStore';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { useRecipeVotes } from '@/lib/data/useRecipeVotes';
import { getNetVotes } from '@/lib/data/recipeVotesStore';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { formatTastingDate } from '@/lib/utils/date';

const FEED_LIMIT = 5;

// Dashboard notification widget shared by Roaster, Cafe, and Admin — visual
// template borrowed from components/cafe/GuestFeedback.tsx. Roaster/Admin
// get the device-approval action (canApprove); Cafe sees both feeds
// read-only. There is deliberately no manual "assign Community Choice"
// action anywhere — the "🔥 Топ сообщества" badge is purely algorithmic
// (top COMMUNITY_TOP_SLOTS by net votes, min COMMUNITY_TOP_MIN_NET_VOTES —
// see components/coffee/ExtractionTab.tsx for the same rule applied on the
// Lot Card), so nobody can hand-pick a "favorite" and introduce bias.
export function CommunityHighlights({
  scopeLots,
  canApprove,
}: {
  scopeLots: Lot[];
  canApprove: boolean;
}) {
  const customDevices = useCustomDevices();
  const pendingDevices = customDevices
    .filter((device) => !device.approved)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, FEED_LIMIT);

  const scopeLotIds = new Set(scopeLots.map((lot) => lot.id));
  const allRecipes = useBrewingRecipes();
  const votes = useRecipeVotes();
  const topRecipes = allRecipes
    .filter((recipe) => recipe.authorType === 'enthusiast' && recipe.isPublic && scopeLotIds.has(recipe.lotId))
    .map((recipe) => ({ recipe, net: getNetVotes(recipe.id, votes) }))
    .sort((a, b) => b.net - a.net)
    .slice(0, FEED_LIMIT);

  return (
    <section className="mb-12">
      <p className="section-label mb-4">Сообщество</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <h3 className="font-body font-medium text-sm text-ink-900 mb-1">🔧 Новые кастомные девайсы</h3>
          <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-4">
            {canApprove ? 'Ожидают одобрения' : 'Отправлены энтузиастами'}
          </p>
          {pendingDevices.length === 0 ? (
            <p className="text-sm text-ink-400">Пока нет новых устройств на модерации.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {pendingDevices.map((device) => (
                <div key={device.id} className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm text-ink-900 font-medium leading-tight">{device.label}</p>
                    {canApprove && (
                      <button
                        type="button"
                        onClick={() => approveCustomDevice(device.id)}
                        className="text-xs text-gold-500 underline underline-offset-2 hover:text-gold-600 shrink-0"
                      >
                        Одобрить
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 mb-1">{device.description}</p>
                  <p className="text-[11px] text-ink-300">
                    {device.submittedByName} · {formatTastingDate(device.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <h3 className="font-body font-medium text-sm text-ink-900 mb-1">🏆 Топ рецепты сообщества</h3>
          <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-4">По голосам сообщества</p>
          {topRecipes.length === 0 ? (
            <p className="text-sm text-ink-400">Пока нет опубликованных рецептов от энтузиастов.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {topRecipes.map(({ recipe, net }) => {
                const lot = getMergedLotById(recipe.lotId);
                return (
                  <div key={recipe.id} className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-sm text-ink-900 font-medium leading-tight">{lot?.name ?? recipe.lotId}</p>
                      <span className="data-value text-xs text-ink-500 shrink-0">{net} 👍</span>
                    </div>
                    <p className="text-xs text-ink-500 mb-1">{recipe.authorName}</p>
                    {net >= COMMUNITY_TOP_MIN_NET_VOTES && (
                      <p className="text-[11px] text-gold-500">🔥 Топ сообщества</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
