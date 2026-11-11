'use client';

import { useState } from 'react';
import { deleteShopRank, saveShopRank } from '@/lib/data/loyalty';
import { HALL_CIRCUIT, type ShopRank } from '@/lib/types/loyalty';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

function emptyDraft(shopId: string, nextOrder: number): ShopRank {
  return {
    id: '',
    shopId,
    circuit: HALL_CIRCUIT,
    rankName: '',
    rankOrder: nextOrder,
    colorHex: '#6F4E37',
    beansPercent: 0,
    requiredSpend30d: 0,
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
      <div className="flex items-center gap-3 mb-3">
        <input
          type="color"
          aria-label="Цвет ранга"
          value={draft.colorHex}
          onChange={(e) => setDraft({ ...draft, colorHex: e.target.value })}
          className="w-9 h-9 rounded border border-ink-200 bg-parchment-100 p-0.5 cursor-pointer"
        />
        <div className="flex-1">
          <label className="block text-xs text-ink-400 mb-1">Название ранга</label>
          <input
            value={draft.rankName}
            onChange={(e) => setDraft({ ...draft, rankName: e.target.value })}
            className={fieldClasses}
          />
        </div>
        <div className="w-24">
          <label className="block text-xs text-ink-400 mb-1">Порядок</label>
          <input
            type="number"
            value={draft.rankOrder}
            onChange={(e) => setDraft({ ...draft, rankOrder: Number(e.target.value) || 0 })}
            className={fieldClasses}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Кэшбэк, % (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={draft.beansPercent}
            onChange={(e) => setDraft({ ...draft, beansPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className={fieldClasses}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Порог трат за 30 дней, ₽</label>
          <input
            type="number"
            min={0}
            value={draft.requiredSpend30d}
            onChange={(e) => setDraft({ ...draft, requiredSpend30d: Number(e.target.value) || 0 })}
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

// Cafe dashboard's rank-ladder editor — каждое поле мапится 1:1 на shop_ranks
// (0039): ранг = сумма трат за скользящие 30 дней, процент = кэшбэк зёрнами,
// цвет — шкала обжарки. Контур «Зал» фиксирован — схема допускает второй
// контур, UI этапа 1 его не показывает.
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
      <p className="section-label mb-4">Настройка рангов — контур «Зал»</p>
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
