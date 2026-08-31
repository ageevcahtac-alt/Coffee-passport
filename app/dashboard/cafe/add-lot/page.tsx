'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds } from '@/lib/data/useCafeMenu';
import { addLotToMenu } from '@/lib/data/cafeMenuStore';
import { getRoasterById } from '@/lib/data/roasters';
import { extractLotId } from '@/lib/utils/lotId';
import { useStaffSession } from '@/lib/auth/staffSession';
import type { Lot } from '@/lib/types/coffee';

export default function AddLotPage() {
  const { cafeId } = useStaffSession();
  const activeShopId = cafeId ?? '';
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(activeShopId);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState<Lot | null>(null);

  const available = lots
    .filter((lot) => !menuLotIds.includes(lot.id))
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

  function addLot(lot: Lot) {
    addLotToMenu(activeShopId, lot.id);
    setJustAdded(lot);
    setCode('');
    setError('');
  }

  function handleCodeSubmit(event: FormEvent) {
    event.preventDefault();
    // Accepts a bare code or a pasted passport URL/path alike — see
    // extractLotId for why (QR codes encode the full URL).
    const lotId = extractLotId(code);
    if (!lotId) return;

    const found = lots.find((lot) => lot.id.toUpperCase() === lotId);
    if (!found) {
      setJustAdded(null);
      setError(`Лот с кодом «${code.trim()}» не найден в базе обжарщиков.`);
      return;
    }
    if (menuLotIds.includes(found.id)) {
      setJustAdded(null);
      setError(`${found.name} уже в меню этой кофейни.`);
      return;
    }
    addLot(found);
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          Каталог обжарщиков
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Добавить лот в меню</h1>

        <p className="section-label mb-4">📷 Сканировать QR-код нового лота</p>
        <div
          className="aspect-[3/2] w-full rounded-md border border-dashed border-ink-200
                     bg-parchment-100 flex flex-col items-center justify-center gap-2 mb-3"
          aria-hidden="true"
        >
          <span className="text-4xl">▢</span>
          <span className="text-xs text-ink-400">Наведите камеру на QR-код пачки</span>
        </div>
        <p className="text-xs text-ink-400 mb-4">
          Демо-режим: камера появится позже. Пока введите код лота с этикетки вручную — он тот же,
          что закодирован в QR (например, LOT-XO-COL-004).
        </p>

        <form onSubmit={handleCodeSubmit} className="mb-10">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="LOT-XO-COL-004"
              className="flex-1 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3
                         text-sm data-value text-ink-900 placeholder:text-ink-300
                         focus:border-gold-400"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-sm px-5
                         hover:bg-ink-800 transition-colors
                         disabled:opacity-40 disabled:pointer-events-none"
            >
              Добавить
            </button>
          </div>
          {error && <p className="text-xs text-ink-500 mt-2">⚠ {error}</p>}
          {justAdded && (
            <p className="text-xs text-ink-700 font-medium mt-2">
              ✓ {justAdded.name} добавлен в меню — регион «{justAdded.country}».
            </p>
          )}
        </form>

        <p className="section-label mb-4">Или выберите из каталога</p>

        {available.length === 0 ? (
          <p className="text-ink-500 text-sm mb-8">
            Все доступные лоты уже добавлены в меню этой кофейни.
          </p>
        ) : (
          <div className="flex flex-col gap-4 mb-8">
            {available.map((lot) => (
              <CatalogLotRow key={lot.id} lot={lot} onAdd={() => addLot(lot)} />
            ))}
          </div>
        )}

        <Link href="/dashboard/cafe" className="text-sm text-ink-700 underline underline-offset-2">
          ← Назад в меню
        </Link>
      </div>
    </main>
  );
}

function CatalogLotRow({ lot, onAdd }: { lot: Lot; onAdd: () => void }) {
  const roaster = getRoasterById(lot.roasterId);

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="font-display text-lg text-ink-900 leading-tight">{lot.name}</h3>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
            {roaster?.name ?? 'Обжарщик не указан'} · {lot.country}
          </p>
        </div>
        <span className="data-value text-sm text-gold-500 shrink-0">{lot.qGrade.toFixed(1)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {lot.variety && <span className="data-value text-[11px] text-ink-400">{lot.variety}</span>}
        {lot.process && <span className="data-value text-[11px] text-ink-400">{lot.process}</span>}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-5 py-3
                   hover:bg-ink-800 transition-colors"
      >
        Добавить в меню
      </button>
    </div>
  );
}
