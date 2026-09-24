'use client';

import Link from 'next/link';
import type { ApiError } from '@/lib/orders/useStaffApi';
import type { StageTone } from '@/lib/orders/roasteryOrders';

// Small shared pieces for the coffee-shop orders tab and the roastery
// production screen: the loading / permission / "Admin unavailable" / error
// states and a status pill, all in the cabinet's existing ink/parchment/gold
// vocabulary.

export function LoadingBlock({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="text-sm text-ink-400">{label}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 rounded-md border border-ink-100 bg-parchment-200 animate-pulse" />
      ))}
    </div>
  );
}

export function ApiErrorBlock({ error, onRetry, nextPath }: { error: ApiError; onRetry?: () => void; nextPath?: string }) {
  const title =
    error.kind === 'forbidden'
      ? 'Нет доступа'
      : error.kind === 'unauthenticated'
        ? 'Требуется вход'
        : error.kind === 'unavailable'
          ? 'XO COFFEE временно недоступен'
          : error.kind === 'not_found'
            ? 'Не найдено'
            : 'Не удалось загрузить';
  return (
    <div role="alert" className="rounded-md border border-ink-200 bg-parchment-200 px-5 py-4">
      <p className="font-display text-lg text-ink-900 mb-1">{title}</p>
      <p className="text-sm text-ink-500 mb-3">{error.message}</p>
      <div className="flex flex-wrap gap-3">
        {error.kind === 'unauthenticated' ? (
          <Link
            href={`/auth/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
            className="text-sm text-ink-900 underline underline-offset-2"
          >
            Войти
          </Link>
        ) : null}
        {onRetry && error.kind !== 'forbidden' && error.kind !== 'unauthenticated' ? (
          <button type="button" onClick={onRetry} className="text-sm text-ink-900 underline underline-offset-2">
            Повторить
          </button>
        ) : null}
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<StageTone, string> = {
  waiting: 'border-gold-300 bg-gold-50 text-gold-600',
  active: 'border-ink-200 bg-parchment-50 text-ink-700',
  done: 'border-moss-300 bg-moss-100 text-moss-700',
  muted: 'border-ink-100 bg-parchment-200 text-ink-400',
};

export function StatusPill({ label, tone }: { label: string; tone: StageTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-body ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
