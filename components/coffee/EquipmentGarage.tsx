'use client';

import { useEffect, useState } from 'react';
import { FILTER_DEVICE_PRESETS, type EquipmentOwnerKind, type EquipmentSetup } from '@/lib/types/coffee';
import { useEquipment } from '@/lib/data/useEquipment';
import { getEquipmentForUser, saveEquipment, syncEquipmentFromSupabase } from '@/lib/data/equipmentStore';
import { useCustomDevices } from '@/lib/data/useCustomDevices';
import { ComboSelect } from '@/components/shared/ComboSelect';
import { FavoriteDevicePicker } from '@/components/coffee/FavoriteDevicePicker';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

type EditingSection = 'espresso' | 'filter' | null;

function hasEspresso(setup: EquipmentSetup | undefined): boolean {
  return Boolean(setup?.espressoGrinder || setup?.espressoMachine || setup?.espressoWater);
}

function hasFilter(setup: EquipmentSetup | undefined): boolean {
  return Boolean(setup?.filterGrinder || setup?.filterWater);
}

// The "Гараж" — one shared component for the Enthusiast (/journey/equipment),
// Cafe (/dashboard/cafe/equipment), and Roaster (/dashboard/roaster/equipment)
// profiles alike, parameterized only by whose setup it reads/writes
// (ownerId/ownerName — a demo user id, a coffee-shop id, or a roaster id;
// equipmentStore.ts is keyed generically by userId already) and which
// suggestion lists fit that role (home gear vs. commercial). Default view
// is read-only cards/chips — editing only ever opens for one section at a
// time, and always collapses back to the card view on save.
export function EquipmentGarage({
  ownerId,
  ownerName,
  ownerKind,
  grinderOptions,
  machineOptions,
}: {
  ownerId: string;
  ownerName: string;
  ownerKind: EquipmentOwnerKind;
  grinderOptions: string[];
  machineOptions: string[];
}) {
  useEquipment(); // subscribes to store changes; `saved` below is read fresh every render
  const saved = getEquipmentForUser(ownerId);
  const customDevices = useCustomDevices();

  // Supabase is the source of truth once reachable — pull this owner's
  // Garage in on mount (and whenever ownerId changes) so a setup saved on
  // another device shows up here too. Local cache/render stays correct
  // even before this resolves or if it fails (offline, no account yet).
  useEffect(() => {
    void syncEquipmentFromSupabase(ownerId);
  }, [ownerId]);

  const [editing, setEditing] = useState<EditingSection>(null);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  const [espressoGrinder, setEspressoGrinder] = useState('');
  const [espressoMachine, setEspressoMachine] = useState('');
  const [espressoWater, setEspressoWater] = useState('');
  const [filterGrinder, setFilterGrinder] = useState('');
  const [filterWater, setFilterWater] = useState('');

  function startEditingEspresso() {
    setEspressoGrinder(saved?.espressoGrinder ?? '');
    setEspressoMachine(saved?.espressoMachine ?? '');
    setEspressoWater(saved?.espressoWater ?? '');
    setEditing('espresso');
  }

  function startEditingFilter() {
    setFilterGrinder(saved?.filterGrinder ?? '');
    setFilterWater(saved?.filterWater ?? '');
    setEditing('filter');
  }

  function persist(patch: Partial<Omit<EquipmentSetup, 'userId' | 'updatedAt'>>) {
    saveEquipment({
      userId: ownerId,
      ownerKind,
      espressoGrinder: saved?.espressoGrinder ?? '',
      espressoMachine: saved?.espressoMachine ?? '',
      espressoWater: saved?.espressoWater ?? '',
      filterGrinder: saved?.filterGrinder ?? '',
      filterWater: saved?.filterWater ?? '',
      favoriteDeviceIds: saved?.favoriteDeviceIds ?? [],
      ...patch,
    });
  }

  function saveEspresso() {
    persist({
      espressoGrinder: espressoGrinder.trim(),
      espressoMachine: espressoMachine.trim(),
      espressoWater: espressoWater.trim(),
    });
    setEditing(null);
  }

  function saveFilter() {
    persist({ filterGrinder: filterGrinder.trim(), filterWater: filterWater.trim() });
    setEditing(null);
  }

  const selectedDeviceIds = saved?.favoriteDeviceIds ?? [];

  function deviceLabel(id: string): string {
    return FILTER_DEVICE_PRESETS.find((preset) => preset.id === id)?.label ?? customDevices.find((device) => device.id === id)?.label ?? id;
  }

  function removeDevice(id: string) {
    persist({ favoriteDeviceIds: selectedDeviceIds.filter((existing) => existing !== id) });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-md border border-ink-200 bg-parchment-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="section-label">☕ Espresso Setup</p>
          {editing !== 'espresso' && (
            <EditTrigger hasData={hasEspresso(saved)} onClick={startEditingEspresso} label="эспрессо-сетап" />
          )}
        </div>

        {editing === 'espresso' ? (
          <div className="flex flex-col gap-3">
            <ComboSelect label="Кофемолка под эспрессо" options={grinderOptions} value={espressoGrinder} onChange={setEspressoGrinder} />
            <ComboSelect label="Эспрессо-машина" options={machineOptions} value={espressoMachine} onChange={setEspressoMachine} />
            <div>
              <label htmlFor="eq-espresso-water" className="block text-xs text-ink-400 mb-1.5">Вода</label>
              <input id="eq-espresso-water" value={espressoWater} onChange={(e) => setEspressoWater(e.target.value)}
                placeholder="Third Wave Water Classic" className={fieldClasses} />
            </div>
            <EditActions onCancel={() => setEditing(null)} onSave={saveEspresso} />
          </div>
        ) : hasEspresso(saved) ? (
          <dl className="flex flex-col gap-2 text-sm">
            <SetupRow label="Кофемолка" value={saved!.espressoGrinder} />
            <SetupRow label="Машина" value={saved!.espressoMachine} />
            <SetupRow label="Вода" value={saved!.espressoWater} />
          </dl>
        ) : (
          <p className="text-sm text-ink-400">Сетап ещё не указан.</p>
        )}
      </section>

      <section className="rounded-md border border-ink-200 bg-parchment-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="section-label">🧪 Filter Setup</p>
          {editing !== 'filter' && (
            <EditTrigger hasData={hasFilter(saved)} onClick={startEditingFilter} label="фильтр-сетап" />
          )}
        </div>

        {editing === 'filter' ? (
          <div className="flex flex-col gap-3 mb-5">
            <ComboSelect label="Кофемолка под фильтр" options={grinderOptions} value={filterGrinder} onChange={setFilterGrinder} />
            <div>
              <label htmlFor="eq-filter-water" className="block text-xs text-ink-400 mb-1.5">Вода</label>
              <input id="eq-filter-water" value={filterWater} onChange={(e) => setFilterWater(e.target.value)}
                placeholder="Бутилированная, TDS ~120 ppm" className={fieldClasses} />
            </div>
            <EditActions onCancel={() => setEditing(null)} onSave={saveFilter} />
          </div>
        ) : hasFilter(saved) ? (
          <dl className="flex flex-col gap-2 text-sm mb-5">
            <SetupRow label="Кофемолка" value={saved!.filterGrinder} />
            <SetupRow label="Вода" value={saved!.filterWater} />
          </dl>
        ) : (
          <p className="text-sm text-ink-400 mb-5">Сетап ещё не указан.</p>
        )}

        <p className="text-xs text-ink-400 mb-2">Любимые девайсы</p>
        {devicePickerOpen ? (
          <FavoriteDevicePicker
            selectedIds={selectedDeviceIds}
            onChange={(ids) => persist({ favoriteDeviceIds: ids })}
            currentUserId={ownerId}
            currentUserName={ownerName}
          />
        ) : selectedDeviceIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedDeviceIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold-400 bg-gold-400/10 text-ink-900 text-sm pl-3 pr-2 py-1.5"
              >
                {deviceLabel(id)}
                <button
                  type="button"
                  onClick={() => removeDevice(id)}
                  aria-label={`Убрать ${deviceLabel(id)}`}
                  className="text-ink-400 hover:text-ink-900 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">Девайсы ещё не выбраны.</p>
        )}
        <button
          type="button"
          onClick={() => setDevicePickerOpen((prev) => !prev)}
          className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-3"
        >
          {devicePickerOpen ? 'Готово' : selectedDeviceIds.length > 0 ? 'Изменить девайсы' : '+ Добавить девайс'}
        </button>
      </section>
    </div>
  );
}

function EditTrigger({ hasData, onClick, label }: { hasData: boolean; onClick: () => void; label: string }) {
  if (hasData) {
    return (
      <button type="button" onClick={onClick} aria-label={`Редактировать ${label}`} className="text-ink-400 hover:text-ink-900 shrink-0">
        ✏️
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900 shrink-0">
      + Добавить сетап
    </button>
  );
}

function EditActions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex gap-3 mt-1">
      <button type="button" onClick={onCancel}
        className="text-sm text-ink-500 underline underline-offset-2 hover:text-ink-900">
        Отмена
      </button>
      <button type="button" onClick={onSave}
        className="text-sm text-ink-900 font-medium underline underline-offset-2 hover:text-gold-500">
        Сохранить
      </button>
    </div>
  );
}

function SetupRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="data-value text-ink-900 text-right">{value}</dd>
    </div>
  );
}
