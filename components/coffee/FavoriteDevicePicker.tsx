'use client';

import { useState } from 'react';
import { FILTER_DEVICE_PRESETS } from '@/lib/types/coffee';
import { useCustomDevices } from '@/lib/data/useCustomDevices';
import { addCustomDevice } from '@/lib/data/customDevicesStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Chip grid of filter devices: the built-in FILTER_DEVICE_PRESETS, every
// platform-approved CustomDevice, and the current user's own not-yet-
// approved submissions (visible only to them until a Roaster/Admin
// approves it — see lib/data/customDevicesStore.ts). A trailing "+ Свой
// девайс" chip opens an inline submission form; Save stays disabled until
// a description is entered, per the task's explicit validation rule.
export function FavoriteDevicePicker({
  selectedIds,
  onChange,
  currentUserId,
  currentUserName,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  currentUserId: string;
  currentUserName: string;
}) {
  const customDevices = useCustomDevices();
  const visibleCustomDevices = customDevices.filter(
    (device) => device.approved || device.submittedByUserId === currentUserId
  );

  const [addingDevice, setAddingDevice] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  function handleAddDevice() {
    if (!newLabel.trim() || !newDescription.trim()) return;
    const device = addCustomDevice({
      label: newLabel.trim(),
      description: newDescription.trim(),
      submittedByUserId: currentUserId,
      submittedByName: currentUserName,
    });
    onChange([...selectedIds, device.id]);
    setNewLabel('');
    setNewDescription('');
    setAddingDevice(false);
  }

  const canAddDevice = Boolean(newLabel.trim() && newDescription.trim());

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTER_DEVICE_PRESETS.map((preset) => (
          <Chip key={preset.id} label={preset.label} selected={selectedIds.includes(preset.id)} onClick={() => toggle(preset.id)} />
        ))}
        {visibleCustomDevices.map((device) => (
          <Chip
            key={device.id}
            label={device.approved ? device.label : `${device.label} (на модерации)`}
            selected={selectedIds.includes(device.id)}
            onClick={() => toggle(device.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => setAddingDevice(true)}
          className="rounded-full border border-dashed border-ink-300 text-ink-500 text-sm px-4 py-2 hover:border-gold-400 hover:text-ink-900 transition-colors"
        >
          + Свой девайс
        </button>
      </div>

      {addingDevice && (
        <div className="mt-4 rounded-md border border-ink-200 bg-parchment-100 p-4 flex flex-col gap-3">
          <div>
            <label htmlFor="device-label" className="block text-xs text-ink-400 mb-1.5">Название девайса</label>
            <input id="device-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Orea V4" className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="device-description" className="block text-xs text-ink-400 mb-1.5">
              Краткое описание принципа работы
            </label>
            <textarea id="device-description" rows={2} value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Плоское дно, спиральные рёбра для равномерной экстракции…" className={fieldClasses} />
            {!newDescription.trim() && (
              <p className="text-xs text-ink-300 mt-1.5">Без описания сохранить нельзя.</p>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setAddingDevice(false); setNewLabel(''); setNewDescription(''); }}
              className="text-sm text-ink-500 underline underline-offset-2 hover:text-ink-900">
              Отмена
            </button>
            <button type="button" onClick={handleAddDevice} disabled={!canAddDevice}
              className="text-sm text-ink-900 font-medium underline underline-offset-2 hover:text-gold-500 disabled:opacity-40 disabled:pointer-events-none">
              Добавить
            </button>
          </div>
          <p className="text-xs text-ink-300">
            Новый девайс появится в вашем списке сразу; в общий каталог платформы он попадёт после одобрения обжарщиком или администратором.
          </p>
        </div>
      )}
    </div>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border text-sm px-4 py-2 transition-colors ${
        selected ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium' : 'border-ink-200 bg-parchment-100 text-ink-700'
      }`}
    >
      {label}
    </button>
  );
}
