'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { STAFF_ROLE_LABELS, type StaffMember, type StaffRole } from '@/lib/types/coffee';
import { generateStaffId } from '@/lib/data/cafeStaffStore';

const STAFF_ROLES: StaffRole[] = [
  'barista',
  'cook',
  'confectioner',
  'administrator',
  'manager',
  'staff',
];

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

interface StaffFormState {
  name: string;
  role: StaffRole;
  hireDate: string;
  achievements: string;
  hobbies: string;
  leadershipQualities: string;
  managerNote: string;
}

function toFormState(member?: StaffMember): StaffFormState {
  if (!member) {
    return {
      name: '',
      role: 'barista',
      hireDate: '',
      achievements: '',
      hobbies: '',
      leadershipQualities: '',
      managerNote: '',
    };
  }
  return {
    name: member.name,
    role: member.role,
    hireDate: member.hireDate,
    achievements: member.achievements,
    hobbies: member.hobbies,
    leadershipQualities: member.leadershipQualities,
    managerNote: member.managerNote,
  };
}

export function StaffForm({
  shopId,
  initialStaff,
  onSave,
  onCancel,
}: {
  shopId: string;
  initialStaff?: StaffMember;
  onSave: (member: StaffMember) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<StaffFormState>(() => toFormState(initialStaff));

  const staffId = useMemo(() => initialStaff?.id ?? generateStaffId(), [initialStaff]);

  function update<K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSave = Boolean(form.name.trim());

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const member: StaffMember = {
      id: staffId,
      shopId,
      name: form.name.trim(),
      role: form.role,
      hireDate: form.hireDate,
      achievements: form.achievements.trim(),
      hobbies: form.hobbies.trim(),
      leadershipQualities: form.leadershipQualities.trim(),
      managerNote: form.managerNote.trim(),
    };

    onSave(member);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <div>
        <p className="section-label mb-4">Основные данные</p>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="staff-name" className="block text-xs text-ink-400 mb-1.5">
              Имя сотрудника
            </label>
            <input
              id="staff-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Алексей"
              required
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="staff-hiredate" className="block text-xs text-ink-400 mb-1.5">
              Дата приёма на работу
            </label>
            <input
              id="staff-hiredate"
              type="date"
              value={form.hireDate}
              onChange={(e) => update('hireDate', e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <span className="block text-xs text-ink-400 mb-2">Роль</span>
            <div className="grid grid-cols-3 gap-2">
              {STAFF_ROLES.map((role) => {
                const checked = form.role === role;
                return (
                  <label
                    key={role}
                    className={`flex items-center justify-center text-center rounded-md border
                                px-2 py-3 text-xs cursor-pointer transition-colors
                                ${checked
                                  ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                  : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
                  >
                    <input
                      type="radio"
                      name="staffRole"
                      value={role}
                      checked={checked}
                      onChange={() => update('role', role)}
                      className="sr-only"
                    />
                    {STAFF_ROLE_LABELS[role]}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Личные данные</p>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="staff-achievements" className="block text-xs text-ink-400 mb-1.5">
              Заслуги / Достижения
            </label>
            <textarea
              id="staff-achievements"
              rows={2}
              value={form.achievements}
              onChange={(e) => update('achievements', e.target.value)}
              placeholder="Победитель латте-арт баттла, 2024…"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="staff-hobbies" className="block text-xs text-ink-400 mb-1.5">
              Интересы / Хобби
            </label>
            <textarea
              id="staff-hobbies"
              rows={2}
              value={form.hobbies}
              onChange={(e) => update('hobbies', e.target.value)}
              placeholder="Сноуборд, домашняя обжарка…"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="staff-leadership" className="block text-xs text-ink-400 mb-1.5">
              Лидерские качества
            </label>
            <textarea
              id="staff-leadership"
              rows={2}
              value={form.leadershipQualities}
              onChange={(e) => update('leadershipQualities', e.target.value)}
              placeholder="Легко обучает новичков…"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="staff-note" className="block text-xs text-ink-400 mb-1.5">
              Краткое описание от руководителя
            </label>
            <textarea
              id="staff-note"
              rows={3}
              value={form.managerNote}
              onChange={(e) => update('managerNote', e.target.value)}
              placeholder="Чтобы новый менеджер сразу понимал, что за человек…"
              className={fieldClasses}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={!canSave}
          className="flex-1 inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {initialStaff ? 'Сохранить изменения' : 'Добавить сотрудника'}
        </button>
      </div>
    </form>
  );
}
