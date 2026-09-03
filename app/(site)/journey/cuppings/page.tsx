'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useCuppings } from '@/lib/data/useCuppings';
import { addCuppingRecord, deleteCuppingRecord } from '@/lib/data/cuppingsStore';
import { CuppingForm, type CuppingFormValues } from '@/components/coffee/CuppingForm';
import { CuppingRecordCard } from '@/components/coffee/CuppingRecordCard';
import { CuppingDetailModal } from '@/components/coffee/CuppingDetailModal';
import type { CuppingRecord } from '@/lib/types/coffee';

export default function CuppingsPage() {
  const { userId, ready } = useCurrentUser();
  // Same flat-array-scoped-by-userId convention as /journey's own
  // `useJourney().filter(...)` — see lib/data/cuppingsStore.ts.
  const records = useCuppings().filter((record) => record.userId === userId);
  const [formOpen, setFormOpen] = useState(false);
  const [openRecord, setOpenRecord] = useState<CuppingRecord | null>(null);

  if (!ready || !userId) return null;

  function handleSave(values: CuppingFormValues) {
    if (!userId) return;
    addCuppingRecord(values, userId);
    setFormOpen(false);
  }

  function handleDelete() {
    if (!openRecord) return;
    deleteCuppingRecord(openRecord.id);
    setOpenRecord(null);
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">Вы</p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">Мои каппинги</h1>
        <p className="text-sm text-ink-500 mb-8">
          Цифровой дневник дегустаций — вместо бумажных записок с каппинг-стола.
        </p>

        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4 mb-10
                       hover:bg-ink-800 transition-colors"
          >
            + Новая запись о каппинге
          </button>
        )}

        {formOpen && (
          <div className="mb-10 reveal-fade">
            <CuppingForm onSave={handleSave} onCancel={() => setFormOpen(false)} />
          </div>
        )}

        <p className="section-label mb-4">История каппингов</p>
        {records.length === 0 ? (
          <p className="text-sm text-ink-400 mb-8">Записей пока нет — добавьте первый каппинг выше.</p>
        ) : (
          <div className="flex flex-col gap-3 mb-8">
            {records.map((record) => (
              <CuppingRecordCard key={record.id} record={record} onClick={() => setOpenRecord(record)} />
            ))}
          </div>
        )}

        <Link href="/journey" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
          ← Моё кофейное путешествие
        </Link>
      </div>

      {openRecord && (
        <CuppingDetailModal
          record={openRecord}
          onClose={() => setOpenRecord(null)}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
}
