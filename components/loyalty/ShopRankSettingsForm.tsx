'use client';

import { useState } from 'react';
import { deleteShopRank, saveShopRank } from '@/lib/data/loyalty';
import type { ShopRank } from '@/lib/types/loyalty';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

function emptyDraft(shopId: string, nextOrder: number): ShopRank {
  return {
    id: '',
    shopId,
    rankName: '',
    rankOrder: nextOrder,
    discountPercent: 0,
    requiredVisits: 0,
    requiredSpend: 0,
    retentionDays: 0,
  };
}

function RankRow({
  rank,
  onSaved,
  onDeleted,
  onCancel,
}: {
  rank: ShopRank;
  onSaved: (rank: ShopRank) => void;
  onDeleted: (id: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(rank);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rank);

  async function handleSave() {
    setSaving(true);
    const result = await saveShopRank(draft);
    setSaving(false);
    if (result.ok && result.rank) {
      setDraft(result.rank);
      onSaved(result.rank);
    }
  }

  async function handleDelete() {
    setSaving(true);
    const result = await deleteShopRank(rank.id);
    setSaving(false);
    if (result.ok) onDeleted(rank.id);
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Название ранга</label>
          <input
            value={draft.rankName}
            onChange={(e) => setDraft({ ...draft, rankName: e.target.value })}
            className={fieldClasses}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Порядок в лестнице</label>
          <input
            type="number"
            value={draft.rankOrder}
            onChange={(e) => setDraft({ ...draft, rankOrder: Number(e.target.value) || 0 })}
            className={fieldClasses}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Скидка, % (0–15)</label>
          <input
            type="number"
            min={0}
            max={15}
            value={draft.discountPercent}
            onChange={(e) => setDraft({ ...draft, discountPercent: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })}
            className={fieldClasses}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Дней до сгорания (0 = никогда)</label>
          <input
            type="number"
            min={0}
            value={draft.retentionDays}
            onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) || 0 })}
            className={fieldClasses}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Порог визитов</label>
          <input
            type="number"
            min={0}
            value={draft.requiredVisits}
            onChange={(e) => setDraft({ ...draft, requiredVisits: Number(e.target.value) || 0 })}
            className={fieldClasses}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Порог трат, ₽</label>
          <input
            type="number"
            min={0}
            value={draft.requiredSpend}
            onChange={(e) => setDraft({ ...draft, requiredSpend: Number(e.target.value) || 0 })}
            className={fieldClasses}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty || !draft.rankName.trim()}
          className="rounded-md bg-ink-900 text-parchment-100 text-xs px-4 py-2
                     hover:bg-ink-800 transition-colors disabled:opacity-40"
        >
          {saving ? '…' : 'Сохранить'}
        </button>
        {rank.id ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
          >
            Удалить ранг
          </button>
        ) : (
          onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
            >
              Отменить
            </button>
          )
        )}
      </div>
    </div>
  );
}

// Cafe dashboard's rank-ladder editor — every field here maps 1:1 onto
// shop_ranks (see supabase/migrations/0012_loyalty_module.sql); a new draft
// row only becomes a real rank once "Сохранить" succeeds (rank.id is empty
// until then), consistent with saveShopRank's insert-vs-update branch.
export function ShopRankSettingsForm({ shopId, initialRanks }: { shopId: string; initialRanks: ShopRank[] }) {
  const [ranks, setRanks] = useState(initialRanks);
  const [draft, setDraft] = useState<ShopRank | null>(null);

  function handleSaved(saved: ShopRank) {
    setRanks((prev) => {
      const withoutDraft = prev.filter((r) => r.id !== saved.id);
      return [...withoutDraft, saved].sort((a, b) => a.rankOrder - b.rankOrder);
    });
    setDraft(null);
  }

  function handleDeleted(id: string) {
    setRanks((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div>
      <p className="section-label mb-4">Настройка рангов</p>
      <div className="flex flex-col gap-3 mb-4">
        {ranks.map((rank) => (
          <RankRow key={rank.id} rank={rank} onSaved={handleSaved} onDeleted={handleDeleted} />
        ))}
        {draft && (
          <RankRow rank={draft} onSaved={handleSaved} onDeleted={() => setDraft(null)} onCancel={() => setDraft(null)} />
        )}
      </div>
      {!draft && (
        <button
          type="button"
          onClick={() => setDraft(emptyDraft(shopId, (ranks[ranks.length - 1]?.rankOrder ?? -1) + 1))}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          + Добавить ранг
        </button>
      )}
    </div>
  );
}
