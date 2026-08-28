'use client';

import { useState } from 'react';

// Note: `next build` prerenders this page's initial client shell, which
// runs PartnerRequestsTab's fetch once server-side during the build. Until
// the partner_requests migration is applied, that logs a harmless
// "table not found" error in the build output — it doesn't fail the build,
// and the real fetch still runs correctly client-side at request time.
import { PartnerRequestsTab } from '@/components/admin/PartnerRequestsTab';
import { PartnersRegistryTab } from '@/components/admin/PartnersRegistryTab';
import { LegacyLotCreator } from '@/components/admin/LegacyLotCreator';

type Tab = 'requests' | 'registry' | 'legacy';

const TABS: { id: Tab; label: string }[] = [
  { id: 'requests', label: 'Заявки' },
  { id: 'registry', label: 'Реестр партнёров' },
  { id: 'legacy', label: 'Создать лот (Supabase)' },
];

// Gated by HTTP Basic Auth in middleware.ts — this page itself has no
// further auth of its own.
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('requests');

  return (
    <main className="min-h-dvh bg-parchment-200 px-6 py-12">
      <div className="max-w-2xl mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          Coffee Passport
        </p>
        <h1 className="font-display text-3xl text-ink-900 mb-8">Кабинет администратора</h1>

        <nav className="flex gap-1 border-b border-ink-200 mb-8 overflow-x-auto">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 px-4 py-3 text-sm font-body border-b-2 -mb-px transition-colors
                            ${active
                              ? 'border-gold-400 text-ink-900 font-medium'
                              : 'border-transparent text-ink-400 hover:text-ink-700'}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {tab === 'requests' && <PartnerRequestsTab />}
        {tab === 'registry' && <PartnersRegistryTab />}
        {tab === 'legacy' && <LegacyLotCreator />}
      </div>
    </main>
  );
}
