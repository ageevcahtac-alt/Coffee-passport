'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { Lot, Roaster, RoastCurvePoint, RoastProfile, RoastSourceFormat } from '@/lib/types/coffee';
import { ROAST_MACHINE_MODELS } from '@/lib/types/coffee';
import { parseRoastFile } from '@/lib/utils/roastImport';
import { ComboSelect } from '@/components/shared/ComboSelect';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

type ProfileInput = Omit<RoastProfile, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

interface FormState {
  machineModel: string;
  chargeTemp: string;
  dropTemp: string;
  firstCrackTimeSec: string;
  totalTimeSec: string;
  dtrPercent: string; // manual fallback, used only when firstCrackTimeSec is empty
  agtronNumber: string;
  notes: string;
}

function toFormState(profile?: RoastProfile): FormState {
  return {
    machineModel: profile?.machineModel ?? '',
    chargeTemp: profile ? String(profile.chargeTemp) : '',
    dropTemp: profile ? String(profile.dropTemp) : '',
    firstCrackTimeSec: profile?.firstCrackTimeSec !== null && profile?.firstCrackTimeSec !== undefined ? String(profile.firstCrackTimeSec) : '',
    totalTimeSec: profile ? String(profile.totalTimeSec) : '',
    dtrPercent: profile?.dtrPercent !== null && profile?.dtrPercent !== undefined ? String(profile.dtrPercent) : '',
    agtronNumber: profile?.agtronNumber !== null && profile?.agtronNumber !== undefined ? String(profile.agtronNumber) : '',
    notes: profile?.notes ?? '',
  };
}

export function RoastProfileForm({
  lot,
  roaster,
  initialProfile,
  onSave,
  onCancel,
}: {
  lot: Lot;
  roaster: Roaster;
  initialProfile?: RoastProfile;
  onSave: (profile: ProfileInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialProfile));
  const [curve, setCurve] = useState<RoastCurvePoint[]>(initialProfile?.curve ?? []);
  const [sourceFormat, setSourceFormat] = useState<RoastSourceFormat>(initialProfile?.sourceFormat ?? 'manual');
  const [sourceFileName, setSourceFileName] = useState<string | null>(initialProfile?.sourceFileName ?? null);
  const [warnings, setWarnings] = useState<string[]>([]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const computedDtr = useMemo(() => {
    const firstCrack = Number(form.firstCrackTimeSec);
    const total = Number(form.totalTimeSec);
    if (!form.firstCrackTimeSec || !Number.isFinite(firstCrack) || !total) return null;
    if (total <= 0 || firstCrack >= total) return null;
    return ((total - firstCrack) / total) * 100;
  }, [form.firstCrackTimeSec, form.totalTimeSec]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = parseRoastFile(text, file.name);
    setCurve(result.points);
    setWarnings(result.warnings);
    setSourceFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
    setSourceFileName(file.name);
    if (!form.totalTimeSec && result.points.length > 0) {
      const lastPoint = result.points[result.points.length - 1];
      update('totalTimeSec', String(lastPoint.timeSec));
    }
  }

  function updatePoint(index: number, key: keyof RoastCurvePoint, value: string) {
    setCurve((prev) => {
      const next = [...prev];
      const numeric = value.trim() === '' ? null : Number(value);
      next[index] = { ...next[index], [key]: key === 'timeSec' ? (numeric ?? 0) : numeric };
      return next;
    });
    setSourceFormat('manual');
  }

  function addPoint() {
    const lastTime = curve.length > 0 ? curve[curve.length - 1].timeSec + 30 : 0;
    setCurve((prev) => [...prev, { timeSec: lastTime, bt: null, et: null, ror: null }]);
    setSourceFormat('manual');
  }

  function removePoint(index: number) {
    setCurve((prev) => prev.filter((_, i) => i !== index));
  }

  const canSave = Boolean(form.chargeTemp && form.dropTemp && form.totalTimeSec);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;

    const dtrPercent = form.firstCrackTimeSec
      ? computedDtr
      : form.dtrPercent
        ? Number(form.dtrPercent)
        : null;

    const profile: ProfileInput = {
      id: initialProfile?.id,
      createdAt: initialProfile?.createdAt,
      lotId: lot.id,
      roasterId: roaster.id,
      machineModel: form.machineModel.trim(),
      chargeTemp: Number(form.chargeTemp),
      dropTemp: Number(form.dropTemp),
      firstCrackTimeSec: form.firstCrackTimeSec ? Number(form.firstCrackTimeSec) : null,
      totalTimeSec: Number(form.totalTimeSec),
      dtrPercent,
      agtronNumber: form.agtronNumber ? Number(form.agtronNumber) : null,
      curve,
      sourceFormat,
      sourceFileName,
      notes: form.notes.trim(),
    };

    onSave(profile);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div>
        <p className="section-label mb-4">Оборудование</p>
        <ComboSelect
          label="Модель обжарочной машины"
          options={ROAST_MACHINE_MODELS}
          value={form.machineModel}
          onChange={(v) => update('machineModel', v)}
        />
      </div>

      <div>
        <p className="section-label mb-4">Ключевые метрики</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rp-charge" className="block text-xs text-ink-400 mb-1.5">Charge, °C</label>
            <input id="rp-charge" type="number" step="0.1" value={form.chargeTemp}
              onChange={(e) => update('chargeTemp', e.target.value)} required className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="rp-drop" className="block text-xs text-ink-400 mb-1.5">Drop, °C</label>
            <input id="rp-drop" type="number" step="0.1" value={form.dropTemp}
              onChange={(e) => update('dropTemp', e.target.value)} required className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="rp-total" className="block text-xs text-ink-400 mb-1.5">Общее время, сек</label>
            <input id="rp-total" type="number" value={form.totalTimeSec}
              onChange={(e) => update('totalTimeSec', e.target.value)} required className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="rp-fc" className="block text-xs text-ink-400 mb-1.5">Первый крэк, сек</label>
            <input id="rp-fc" type="number" value={form.firstCrackTimeSec}
              onChange={(e) => update('firstCrackTimeSec', e.target.value)} className={fieldClasses} />
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="rp-agtron" className="block text-xs text-ink-400 mb-1.5">
            Степень обжарки, Agtron (необязательно)
          </label>
          <input id="rp-agtron" type="number" step="1" min="25" max="95" value={form.agtronNumber}
            onChange={(e) => update('agtronNumber', e.target.value)} placeholder="58" className={fieldClasses} />
          <p className="text-xs text-ink-300 mt-1.5">
            Показывается гостям на визуальной шкале «светлая ↔ тёмная» в карточке лота.
          </p>
        </div>

        <div className="mt-3">
          {form.firstCrackTimeSec ? (
            <p className="text-xs text-ink-400">
              DTR (вычислено): <span className="data-value text-ink-900">{computedDtr !== null ? `${computedDtr.toFixed(1)}%` : '—'}</span>
            </p>
          ) : (
            <div>
              <label htmlFor="rp-dtr" className="block text-xs text-ink-400 mb-1.5">
                DTR вручную, % (заполните, если не указан момент первого крэка)
              </label>
              <input id="rp-dtr" type="number" step="0.1" value={form.dtrPercent}
                onChange={(e) => update('dtrPercent', e.target.value)} className={fieldClasses} />
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Кривая обжарки</p>
        <label htmlFor="rp-file" className="block text-xs text-ink-400 mb-1.5">
          Импорт из CSV/JSON (экспорт из Cropster, Artisan и т.п.)
        </label>
        <input
          id="rp-file"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={handleFileChange}
          className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-md file:border-0
                     file:bg-ink-900 file:text-parchment-100 file:px-4 file:py-2.5 file:text-sm
                     file:font-medium file:cursor-pointer"
        />
        {sourceFileName && <p className="text-xs text-ink-400 mt-2">Загружен файл: {sourceFileName}</p>}
        {warnings.length > 0 && (
          <ul className="text-xs text-ink-500 mt-2 flex flex-col gap-1">
            {warnings.map((warning, i) => (
              <li key={i}>⚠ {warning}</li>
            ))}
          </ul>
        )}

        {curve.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-400 text-left">
                  <th className="pb-2 pr-2">Сек</th>
                  <th className="pb-2 pr-2">BT</th>
                  <th className="pb-2 pr-2">ET</th>
                  <th className="pb-2 pr-2">RoR</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {curve.map((point, index) => (
                  <tr key={index}>
                    <td className="pr-2 py-1">
                      <input type="number" value={point.timeSec}
                        onChange={(e) => updatePoint(index, 'timeSec', e.target.value)}
                        className="w-16 rounded border border-ink-200 bg-parchment-100 px-2 py-1" />
                    </td>
                    <td className="pr-2 py-1">
                      <input type="number" value={point.bt ?? ''}
                        onChange={(e) => updatePoint(index, 'bt', e.target.value)}
                        className="w-16 rounded border border-ink-200 bg-parchment-100 px-2 py-1" />
                    </td>
                    <td className="pr-2 py-1">
                      <input type="number" value={point.et ?? ''}
                        onChange={(e) => updatePoint(index, 'et', e.target.value)}
                        className="w-16 rounded border border-ink-200 bg-parchment-100 px-2 py-1" />
                    </td>
                    <td className="pr-2 py-1">
                      <input type="number" value={point.ror ?? ''}
                        onChange={(e) => updatePoint(index, 'ror', e.target.value)}
                        className="w-16 rounded border border-ink-200 bg-parchment-100 px-2 py-1" />
                    </td>
                    <td className="py-1">
                      <button type="button" onClick={() => removePoint(index)} className="text-ink-300 hover:text-ink-700">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" onClick={addPoint} className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-3">
          + Добавить точку вручную
        </button>
      </div>

      <div>
        <label htmlFor="rp-notes" className="section-label mb-4 block">Заметки обжарщика</label>
        <textarea id="rp-notes" rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)}
          placeholder="Особенности профиля, что искать в чашке…" className={fieldClasses} />
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors">
            Отмена
          </button>
        )}
        <button type="submit" disabled={!canSave}
          className="flex-1 inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          {initialProfile ? 'Сохранить профиль' : 'Опубликовать профиль обжарки'}
        </button>
      </div>
    </form>
  );
}
