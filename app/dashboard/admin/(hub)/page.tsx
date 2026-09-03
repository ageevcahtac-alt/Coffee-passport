'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlatformFeedbackRow, PlatformFeedbackStatus, ProfileRole } from '@/lib/types/database';
import { fetchAllPlatformFeedback, updatePlatformFeedbackStatus } from '@/lib/data/platformFeedback';
import { formatTastingDate } from '@/lib/utils/date';

const STATUS_LABELS: Record<PlatformFeedbackStatus, string> = {
  new: 'Новое',
  in_progress: 'В работе',
  closed: 'Закрыто',
};

const STATUS_ORDER: PlatformFeedbackStatus[] = ['new', 'in_progress', 'closed'];

const TYPE_LABELS: Record<PlatformFeedbackRow['feedback_type'], string> = {
  bug: '🐞 Ошибка',
  ui: '🎨 UI/сервис',
  idea: '💡 Идея',
};

const ROLE_LABELS: Record<ProfileRole, string> = {
  enthusiast: 'Энтузиаст',
  barista: 'Бариста',
  cafe_admin: 'Кофейня',
  roaster_admin: 'Обжарщик',
  admin: 'Админ',
};

const fieldClasses =
  'rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm text-ink-900 focus:border-gold-400';

// The Platform Feedback triage list — everything submitted through
// components/shared/FeedbackWidget.tsx across all four dashboards (see
// public.platform_feedback in supabase/migrations/0009_platform_feedback.sql,
// readable only by role='admin').
export default function AdminFeedbackPage() {
  const [items, setItems] = useState<PlatformFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | ProfileRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PlatformFeedbackStatus>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllPlatformFeedback().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (roleFilter !== 'all' && item.user_role !== roleFilter) return false;
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        return true;
      }),
    [items, roleFilter, statusFilter]
  );

  async function handleStatusChange(id: string, status: PlatformFeedbackStatus) {
    setUpdatingId(id);
    const result = await updatePlatformFeedbackStatus(id, status);
    if (result.ok) {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    }
    setUpdatingId(null);
  }

  return (
    <div>
      <p className="section-label mb-6">Обратная связь и проблемы</p>
      <div>
        <div className="flex flex-wrap gap-3 mb-8">
          <div>
            <label htmlFor="role-filter" className="block text-xs text-ink-400 mb-1.5">
              Роль отправителя
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as 'all' | ProfileRole)}
              className={fieldClasses}
            >
              <option value="all">Все</option>
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status-filter" className="block text-xs text-ink-400 mb-1.5">
              Статус
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | PlatformFeedbackStatus)}
              className={fieldClasses}
            >
              <option value="all">Все</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-ink-400">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-400">Ничего не найдено по этим фильтрам.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                onStatusChange={(status) => handleStatusChange(item.id, status)}
                updating={updatingId === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackRow({
  item,
  onStatusChange,
  updating,
}: {
  item: PlatformFeedbackRow;
  onStatusChange: (status: PlatformFeedbackStatus) => void;
  updating: boolean;
}) {
  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full border border-gold-400 text-gold-500 text-[11px] uppercase tracking-widest2 px-2.5 py-1">
            {TYPE_LABELS[item.feedback_type]}
          </span>
          <span className="data-value rounded-full bg-parchment-200 text-ink-700 text-[11px] px-2.5 py-1">
            {ROLE_LABELS[item.user_role]}
          </span>
        </div>
        <span className="text-[11px] text-ink-300">{formatTastingDate(item.created_at)}</span>
      </div>

      <p className="text-sm text-ink-900 leading-relaxed mb-4">{item.message}</p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-400">Статус:</span>
        <select
          value={item.status}
          disabled={updating}
          onChange={(event) => onStatusChange(event.target.value as PlatformFeedbackStatus)}
          className="rounded-md border border-ink-200 bg-parchment-100 px-2.5 py-1.5 text-xs
                     text-ink-900 focus:border-gold-400 disabled:opacity-50"
        >
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
