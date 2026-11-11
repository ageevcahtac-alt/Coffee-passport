'use client';

import { useState, type FormEvent } from 'react';
import { assignOrden, fetchGuestProfile } from '@/lib/data/loyalty';
import type { ShopRank } from '@/lib/types/loyalty';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Орден: ручное назначение ранга гостю из кабинета кофейни. С флагом
// «навсегда» ранг не скользит read-time — гость держит его независимо от
// трат за 30 дней (зёрна у орденоносца сгорают по общим правилам). RPC
// loyalty_assign_orden принимает только cafe_admin этой кофейни.
export function ShopOrdenForm({ shopId, ranks }: { shopId: string; ranks: ShopRank[] }) {
  const [guestId, setGuestId] = useState('');
  const [guestName, setGuestName] = useState<string | null>(null);
  const [rankId, setRankId] = useState('');
  const [pinned, setPinned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    const profile = await fetchGuestProfile(guestId.trim());
    setGuestName(profile ? profile.displayName ?? 'Гость без имени' : null);
    if (!profile) setMessage({ kind: 'error', text: 'Гость не найден (нужен id энтузиаста).' });
    else setMessage(null);
  }

  async function handleAssign() {
    setBusy(true);
    const result = await assignOrden(guestId.trim(), shopId, rankId || null, pinned);
    setBusy(false);
    if (result.ok) {
      setMessage({
        kind: 'ok',
        text: rankId
          ? `Орден назначен${pinned ? ' «навсегда»' : ''} — ранг не скользит.`
          : 'Орден снят — ранг снова скользит по тратам за 30 дней.',
      });
      setRankId('');
    } else {
      setMessage({ kind: 'error', text: result.error ?? 'Не удалось назначить орден.' });
    }
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <p className="section-label mb-4">Орден — ручной ранг гостю</p>
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
      <div className="grid grid-cols-1 gap-3 mb-3">
        <select value={rankId} onChange={(e) => setRankId(e.target.value)} className={fieldClasses}>
          <option value="">Снять орден</option>
          {ranks.map((rank) => (
            <option key={rank.id} value={rank.id}>
              {rank.rankName} · кэшбэк {rank.beansPercent}%
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-ink-400">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="rounded border-ink-200"
          />
          Навсегда (ранг не скользит по тратам за 30 дней)
        </label>
      </div>
      {message && (
        <p className={`text-sm mb-3 ${message.kind === 'ok' ? 'text-moss-700' : 'text-ink-500'}`}>
          {message.kind === 'ok' ? '✓ ' : '⚠ '}
          {message.text}
        </p>
      )}
      <button
        type="button"
        onClick={handleAssign}
        disabled={busy || !guestId.trim()}
        className="rounded-md bg-ink-900 text-parchment-100 text-xs px-4 py-2
                   hover:bg-ink-800 transition-colors disabled:opacity-40"
      >
        {busy ? '…' : 'Назначить'}
      </button>
    </div>
  );
}
