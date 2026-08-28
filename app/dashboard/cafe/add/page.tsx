'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds } from '@/lib/data/useCafeMenu';
import { addLotToMenu } from '@/lib/data/cafeMenuStore';
import { getRoasterById } from '@/lib/data/roasters';
import type { Lot } from '@/lib/types/coffee';

const ACTIVE_SHOP_ID = 'shop-xo-vsevolozhsk';

export default function AddLotToMenuPage() {
  const router = useRouter();
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(ACTIVE_SHOP_ID);

  const available = lots
    .filter((lot) => !menuLotIds.includes(lot.id))
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

  function handleAdd(lotId: string) {
    addLotToMenu(ACTIVE_SHOP_ID, lotId);
    router.push('/dashboard/cafe');
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          Каталог обжарщиков
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Добавить лот в меню</h1>

        {available.length === 0 ? (
          <p className="text-ink-500 text-sm mb-8">
            Все доступные лоты уже добавлены в меню этой кофейни.
          </p>
        ) : (
          <div className="flex flex-col gap-4 mb-8">
            {available.map((lot) => (
              <CatalogLotRow key={lot.id} lot={lot} onAdd={() => handleAdd(lot.id)} />
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
