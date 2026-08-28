'use client';

import { useState } from 'react';
import { useRoasters } from '@/lib/data/useRoasters';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useLots } from '@/lib/data/useLots';
import { saveRoaster } from '@/lib/data/roasters';
import { saveCoffeeShop } from '@/lib/data/coffeeShops';
import type { CoffeeShop, Roaster } from '@/lib/types/coffee';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-200 px-3 py-2 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export function PartnersRegistryTab() {
  const roasters = useRoasters();
  const coffeeShops = useCoffeeShops();
  const lots = useLots();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="section-label mb-4">Обжарщики</p>
        <div className="flex flex-col gap-4">
          {roasters.map((roaster) => (
            <RoasterEditor
              key={roaster.id}
              roaster={roaster}
              lotCount={lots.filter((lot) => lot.roasterId === roaster.id).length}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Кофейни</p>
        <div className="flex flex-col gap-4">
          {coffeeShops.map((shop) => (
            <CoffeeShopEditor key={shop.id} shop={shop} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoasterEditor({ roaster, lotCount }: { roaster: Roaster; lotCount: number }) {
  const [form, setForm] = useState(roaster);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(roaster);

  function handleSave() {
    saveRoaster(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
        <h3 className="font-display text-lg text-ink-900 leading-tight flex-1">{roaster.name}</h3>
        <span className="data-value text-xs text-ink-400">{lotCount} лотов</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Название</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={fieldClasses}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Город</label>
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={fieldClasses}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-ink-400 shrink-0">Цвет</label>
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          className="w-8 h-8 rounded-full border border-ink-200 cursor-pointer p-0"
        />
        <span className="data-value text-xs text-ink-400">{form.color}</span>
      </div>

      <textarea
        rows={2}
        value={form.philosophy}
        onChange={(e) => setForm({ ...form, philosophy: e.target.value })}
        className={`${fieldClasses} mb-3`}
        placeholder="Философия бренда"
      />

      <button
        type="button"
        disabled={!dirty}
        onClick={handleSave}
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-4 py-2.5
                   hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        {saved ? 'Сохранено!' : 'Сохранить'}
      </button>
    </div>
  );
}

function CoffeeShopEditor({ shop }: { shop: CoffeeShop }) {
  const [form, setForm] = useState(shop);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(shop);

  function handleSave() {
    saveCoffeeShop(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: form.brandColor }} />
        <h3 className="font-display text-lg text-ink-900 leading-tight flex-1">{shop.name}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Название</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={fieldClasses}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Город / адрес</label>
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={fieldClasses}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-ink-400 shrink-0">Цвет</label>
        <input
          type="color"
          value={form.brandColor}
          onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
          className="w-8 h-8 rounded-full border border-ink-200 cursor-pointer p-0"
        />
        <span className="data-value text-xs text-ink-400">{form.brandColor}</span>
      </div>

      <button
        type="button"
        disabled={!dirty}
        onClick={handleSave}
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-4 py-2.5
                   hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        {saved ? 'Сохранено!' : 'Сохранить'}
      </button>
    </div>
  );
}
