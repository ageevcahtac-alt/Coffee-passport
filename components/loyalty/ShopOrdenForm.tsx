'use client';

import { useState, type FormEvent } from 'react';
import { assignOrden, fetchGuestProfile, fetchGuestShopContext } from '@/lib/data/loyalty';
import type { GuestShopStatus, ShopRank } from '@/lib/types/loyalty';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Орден — привилегия, которая существует ТОЛЬКО на высшем ранге лестницы
// «Зал» (топ по rank_order, «Хранитель вкуса»). Пока орден закреплён, ранг
// гостя не скользит по тратам за 30 дней; открепили — обычное скольжение по
// фактическим тратам. Выбора уровня нет: RPC loyalty_assign_orden принимает
// только топовый ранг (иное — ошибка, см. миграцию 0043) и только cafe_admin
// этой кофейни. Зёрна у орденоносца сгорают по общим правилам (90 дней).
export function ShopOrdenForm({ shopId, ranks }: { shopId: string; ranks: ShopRank[] }) {
  const topRank = ranks.reduce<ShopRank | null>(
    (best, rank) => (best && best.rankOrder >= rank.rankOrder ? best : rank),
    null
  );
  const [guestId, setGuestId] = useState('');
  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestStatus, setGuestStatus] = useState<GuestShopStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    const id = guestId.trim();
    const profile = await fetchGuestProfile(id);
    setGuestName(profile ? profile.displayName ?? 'Гость без имени' : null);
    if (!profile) {
      setGuestStatus(null);
      setMessage({ kind: 'error', text: 'Гость не найден (нужен id энтузиаста).' });
      return;
    }
    const context = await fetchGuestShopContext(id, shopId);
    setGuestStatus(context.status);
    setMessage(null);
  }

  async function handleAssign() {
    if (!topRank) return;
    setBusy(true);
    const result = await assignOrden(guestId.trim(), shopId, topRank.id, true);
    setBusy(false);
    if (result.ok) {
      if (result.status) setGuestStatus(result.status);
      setMessage({
        kind: 'ok',
        text: `Орден закреплён — «${topRank.rankName}»: ранг не скользит по тратам за 30 дней.`,
      });
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось закрепить орден.' });
    }
  }

  async function handleUnassign() {
    setBusy(true);
    const result = await assignOrden(guestId.trim(), shopId, null, true);
    setBusy(false);
    if (result.ok) {
      if (result.status) setGuestStatus(result.status);
      setMessage({ kind: 'ok', text: 'Орден откреплён — ранг снова скользит по тратам за 30 дней.' });
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось открепить орден.' });
    }
  }

  const ordenPinned = Boolean(guestStatus?.ordenRankId && guestStatus.ordenPinned);

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <p className="section-label mb-4">Орден — привилегия высшего ранга</p>
      <form onSubmit={handleLookup} className="flex gap-2 mb-3">
        <input
          value={guestId}
          onChange={(e) => setGuestId(e.target.value)}
          placeholder="ID гостя (uuid из QR)"
          className={fieldClasses}
        />
        <button
          type="submit"
          disabled={!guestId.trim()}
          className="shrink-0 rounded-md border border-ink-200 px-4 text-sm text-ink-700
                     hover:bg-parchment-300 transition-colors disabled:opacity-40"
        >
          Найти
        </button>
      </form>
      {guestName && <p className="text-sm text-ink-900 mb-3">Гость: {guestName}</p>}
      <div className="rounded-md border border-gold-300 bg-parchment-100 px-3 py-2 mb-3 text-xs text-ink-500">
        Орден крепится только к высшему рангу «Зала» — «{topRank?.rankName ?? 'рангов нет'}»
        {topRank ? ` · кэшбэк ${topRank.beansPercent}%` : ''}. Пока закреплён, ранг гостя не скользит
        по тратам за 30 дней; зёрна сгорают по общим правилам (90 дней).
      </div>
      {guestName && (
        <p className={`text-xs mb-3 ${ordenPinned ? 'text-gold-500' : 'text-ink-400'}`}>
          {ordenPinned ? '🎖 Орден закреплён за этим гостем.' : 'Орден не закреплён.'}
        </p>
      )}
      {message && (
        <p className={`text-sm mb-3 ${message.kind === 'ok' ? 'text-moss-700' : 'text-ink-500'}`}>
          {message.kind === 'ok' ? '✓ ' : '⚠ '}
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAssign}
          disabled={busy || !guestId.trim() || !topRank}
          className="rounded-md bg-ink-900 text-parchment-100 text-xs px-4 py-2
                     hover:bg-ink-800 transition-colors disabled:opacity-40"
        >
          {busy ? '…' : '🎖 Закрепить орден'}
        </button>
        <button
          type="button"
          onClick={handleUnassign}
          disabled={busy || !guestId.trim()}
          className="rounded-md border border-ink-200 text-xs px-4 py-2 text-ink-700
                     hover:bg-parchment-300 transition-colors disabled:opacity-40"
        >
          Открепить орден
        </button>
      </div>
    </div>
  );
}
