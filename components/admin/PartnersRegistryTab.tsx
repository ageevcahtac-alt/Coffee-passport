'use client';

import { useEffect, useState } from 'react';
import { useRoasters } from '@/lib/data/useRoasters';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useLots } from '@/lib/data/useLots';
import {
  archiveLegacyRoasters,
  getLegacyRoasters,
  isRoasterInDatabase,
  refreshRoasters,
} from '@/lib/data/roasters';
import {
  archiveLegacyCoffeeShops,
  getLegacyCoffeeShops,
  isCoffeeShopInDatabase,
  refreshCoffeeShops,
} from '@/lib/data/coffeeShops';
import { PARTNER_STATUSES, PARTNER_STATUS_LABELS, type PartnerKind } from '@/lib/data/partnerRows';
import type { CoffeeShop, Roaster } from '@/lib/types/coffee';
import type { PartnerStatus } from '@/lib/types/database';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-200 px-3 py-2 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const buttonClasses =
  'inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100 font-body ' +
  'font-medium text-sm px-4 py-2.5 hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none';

type ImportResult = { created: string[]; skipped: { id: string; reason: 'exists' | 'invalid' }[] };

async function importCards(coffeeShops: CoffeeShop[], roasters: Roaster[]): Promise<ImportResult> {
  const response = await fetch('/api/admin/partners/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coffeeShops, roasters }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Не удалось перенести.');
  return body as ImportResult;
}

async function patchPartner(kind: PartnerKind, id: string, patch: Record<string, string>): Promise<void> {
  const response = await fetch(`/api/admin/partners/${kind}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Не удалось сохранить.');
}

// "Реестр партнёров": every card the product shows — database rows
// (coffee_shops / roasters, 0036_partner_directory.sql) and built-in cards
// not in the database yet. Saving writes the database through
// /api/admin/partners/**; a built-in card is inserted on its first save.
export function PartnersRegistryTab() {
  const roasters = useRoasters();
  const coffeeShops = useCoffeeShops();
  const lots = useLots();

  return (
    <div className="flex flex-col gap-8">
      <LegacyTransfer />

      <div>
        <p className="section-label mb-4">Обжарщики</p>
        <div className="flex flex-col gap-4">
          {roasters.map((roaster) => (
            <RoasterEditor
              key={`${roaster.id}:${roaster.status}:${roaster.color}:${roaster.name}:${roaster.city}:${roaster.philosophy}`}
              roaster={roaster}
              inDatabase={isRoasterInDatabase(roaster.id)}
              lotCount={lots.filter((lot) => lot.roasterId === roaster.id).length}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Кофейни</p>
        <div className="flex flex-col gap-4">
          {coffeeShops.map((shop) => (
            <CoffeeShopEditor
              key={`${shop.id}:${shop.status}:${shop.brandColor}:${shop.name}:${shop.city}`}
              shop={shop}
              inDatabase={isCoffeeShopInDatabase(shop.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Cards the old admin screens saved only in this browser's localStorage —
// shown here and moved into the database with one button. Cards already in
// the database are not overwritten; transferred ones move to a backup key.
function LegacyTransfer() {
  const [shops, setShops] = useState<CoffeeShop[]>([]);
  const [roasters, setRoasters] = useState<Roaster[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // localStorage only exists after mount — reading it during render would
  // mismatch the server HTML.
  useEffect(() => {
    setShops(getLegacyCoffeeShops());
    setRoasters(getLegacyRoasters());
  }, []);

  if (shops.length === 0 && roasters.length === 0 && !message) return null;

  async function handleTransfer() {
    setBusy(true);
    setMessage('');
    try {
      const result = await importCards(shops, roasters);
      const settled = new Set([
        ...result.created,
        ...result.skipped.filter((item) => item.reason === 'exists').map((item) => item.id),
      ]);
      archiveLegacyCoffeeShops(shops.filter((shop) => settled.has(shop.id)).map((shop) => shop.id));
      archiveLegacyRoasters(roasters.filter((roaster) => settled.has(roaster.id)).map((roaster) => roaster.id));
      await Promise.all([refreshCoffeeShops(), refreshRoasters()]);
      setShops(getLegacyCoffeeShops());
      setRoasters(getLegacyRoasters());
      const exists = result.skipped.filter((item) => item.reason === 'exists').length;
      const invalid = result.skipped.filter((item) => item.reason === 'invalid').length;
      setMessage(
        `Перенесено в базу: ${result.created.length}.` +
          (exists ? ` Уже были в базе (не перезаписаны): ${exists}.` : '') +
          (invalid ? ` Не перенесено — ошибка в данных: ${invalid}.` : '')
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось перенести.');
    } finally {
      setBusy(false);
    }
  }

  const items = [
    ...roasters.map((roaster) => ({ id: roaster.id, name: roaster.name, color: roaster.color, label: 'обжарщик' })),
    ...shops.map((shop) => ({ id: shop.id, name: shop.name, color: shop.brandColor, label: 'кофейня' })),
  ];

  return (
    <div className="rounded-md border border-gold-400 bg-gold-400/10 p-5">
      <p className="section-label mb-2">Данные из этого браузера</p>
      {items.length > 0 && (
        <>
          <p className="text-sm text-ink-700 mb-3">
            Эти карточки раньше сохранялись только в этом браузере и не видны другим посетителям.
          </p>
          <ul className="flex flex-col gap-1.5 mb-4">
            {items.map((item) => (
              <li key={`${item.label}:${item.id}`} className="flex items-center gap-2 text-sm text-ink-900">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="flex-1">{item.name}</span>
                <span className="data-value text-xs text-ink-400">
                  {item.label} · {item.id}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={handleTransfer} className={buttonClasses}>
            {busy ? 'Переносим…' : `Перенести в базу (${items.length})`}
          </button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm text-ink-700 mt-3">
          {message}
        </p>
      )}
    </div>
  );
}

function useSave(save: () => Promise<void>) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  async function run() {
    setState('saving');
    setError('');
    try {
      await save();
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить.');
      setState('idle');
    }
  }
  return { state, error, run };
}

function StatusAndBadge({
  status,
  inDatabase,
  onChange,
}: {
  status: PartnerStatus;
  inDatabase: boolean;
  onChange: (status: PartnerStatus) => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <label className="text-xs text-ink-400 shrink-0">Статус</label>
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as PartnerStatus)}
        className="rounded-md border border-ink-200 bg-parchment-200 px-2 py-1.5 text-sm text-ink-900"
      >
        {PARTNER_STATUSES.map((value) => (
          <option key={value} value={value}>
            {PARTNER_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-ink-400">
        {inDatabase ? 'в базе' : 'встроенная карточка — попадёт в базу при сохранении'}
      </span>
    </div>
  );
}

function RoasterEditor({ roaster, inDatabase, lotCount }: { roaster: Roaster; inDatabase: boolean; lotCount: number }) {
  const [form, setForm] = useState(roaster);
  const dirty = JSON.stringify(form) !== JSON.stringify(roaster);
  const { state, error, run } = useSave(async () => {
    if (!inDatabase) await importCards([], [form]);
    await patchPartner('roaster', form.id, {
      name: form.name,
      city: form.city,
      country: form.country,
      philosophy: form.philosophy,
      color: form.color,
      status: form.status,
    });
    await refreshRoasters();
  });

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
        <h3 className="font-display text-lg text-ink-900 leading-tight flex-1">{roaster.name}</h3>
        <span className="data-value text-xs text-ink-400">{lotCount} лотов</span>
      </div>

      <StatusAndBadge status={form.status} inDatabase={inDatabase} onChange={(status) => setForm({ ...form, status })} />

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

      <button type="button" disabled={!dirty || state === 'saving'} onClick={run} className={buttonClasses}>
        {state === 'saving' ? 'Сохраняем…' : state === 'saved' ? 'Сохранено!' : 'Сохранить'}
      </button>
      {error && <p className="text-xs text-ink-700 mt-2">⚠ {error}</p>}
    </div>
  );
}

function CoffeeShopEditor({ shop, inDatabase }: { shop: CoffeeShop; inDatabase: boolean }) {
  const [form, setForm] = useState(shop);
  const dirty = JSON.stringify(form) !== JSON.stringify(shop);
  const { state, error, run } = useSave(async () => {
    if (!inDatabase) await importCards([shop], []);
    await patchPartner('coffee_shop', form.id, {
      name: form.name,
      city: form.city,
      color: form.brandColor,
      status: form.status,
    });
    await refreshCoffeeShops();
  });

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: form.brandColor }} />
        <h3 className="font-display text-lg text-ink-900 leading-tight flex-1">{shop.name}</h3>
        <span className="data-value text-xs text-ink-400">{shop.id}</span>
      </div>

      <StatusAndBadge status={form.status} inDatabase={inDatabase} onChange={(status) => setForm({ ...form, status })} />

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

      <button type="button" disabled={!dirty || state === 'saving'} onClick={run} className={buttonClasses}>
        {state === 'saving' ? 'Сохраняем…' : state === 'saved' ? 'Сохранено!' : 'Сохранить'}
      </button>
      {error && <p className="text-xs text-ink-700 mt-2">⚠ {error}</p>}
    </div>
  );
}
