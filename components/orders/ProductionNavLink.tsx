'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useStaffApi } from '@/lib/orders/useStaffApi';
import { countNewProductionJobs, type ProductionJob } from '@/lib/orders/roasteryOrders';

// The roaster cabinet's «Производство и отгрузка» link, with a counter of
// production jobs waiting to be started (see isNewProductionJob). Reads the
// same roaster-scoped /api/roaster/production the production screen uses, so
// it can never count another roastery's jobs. Re-reads once a minute while
// the tab is visible; if Admin is unavailable the link simply shows no badge.

const REFRESH_MS = 60_000;

export function ProductionNavLink() {
  const jobs = useStaffApi<ProductionJob[]>('/api/roaster/production');
  const { reload } = jobs;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  const count = jobs.status === 'ready' ? countNewProductionJobs(jobs.data) : 0;
  const badge = count > 99 ? '99+' : count > 0 ? String(count) : null;

  return (
    <Link
      href="/dashboard/roaster/production"
      aria-label={badge ? `Производство и отгрузка, новых заказов: ${badge}` : undefined}
      className="inline-flex items-center gap-1.5 text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
    >
      🏭 Производство и отгрузка
      {badge ? (
        <span
          aria-hidden="true"
          title="Новые заказы в очереди"
          className="min-w-[16px] h-4 px-1 rounded-full bg-ink-900 text-parchment-100
                     text-[10px] leading-4 text-center font-medium no-underline"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
