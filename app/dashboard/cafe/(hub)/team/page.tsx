'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCafeStaff } from '@/lib/data/useCafeStaff';
import { isBrowserOnlyStaff } from '@/lib/data/cafeStaffStore';
import { useShopCheckins } from '@/lib/data/useShopCheckins';
import { StaffCard } from '@/components/cafe/StaffCard';
import { BaristaAccountForm } from '@/components/cafe/BaristaAccountForm';
import { BaristaAccountsList, type BaristaAccount } from '@/components/cafe/BaristaAccountsList';
import { useStaffSession } from '@/lib/auth/staffSession';

// «Команда»: one «+ Добавить сотрудника» that creates a real login (email +
// temporary password), the cafe's logins with their status, then the static
// roster cards — including cards once saved only in this browser, shown so
// they are not lost (each can become a login with the name filled in).
export default function CafeTeamPage() {
  const { cafeId } = useStaffSession();
  const allStaff = useCafeStaff();
  const { records } = useShopCheckins(cafeId ?? '');
  const [adding, setAdding] = useState(false);
  const [prefillName, setPrefillName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BaristaAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/cafe/staff/barista-accounts', { cache: 'no-store' });
      const result = (await response.json().catch(() => ({}))) as { accounts?: BaristaAccount[]; error?: string };
      if (response.ok && result.accounts) {
        setAccounts(result.accounts);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? 'Не удалось загрузить учётки.');
      }
    } catch {
      setLoadError('Нет связи с сервером.');
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    // The old «new staff» page now lands here with ?add=1.
    if (new URLSearchParams(window.location.search).get('add') === '1') setAdding(true);
  }, [loadAccounts]);

  const ratings = useMemo(() => {
    const byBarista = new Map<string, { average: number; count: number }>();
    for (const record of records) {
      if (record.baristaRating <= 0) continue;
      const current = byBarista.get(record.baristaId) ?? { average: 0, count: 0 };
      const count = current.count + 1;
      byBarista.set(record.baristaId, { count, average: current.average + (record.baristaRating - current.average) / count });
    }
    return byBarista;
  }, [records]);

  const cards = allStaff
    .filter((member) => member.shopId === cafeId)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  function startAdding(name = '') {
    setPrefillName(name);
    setMessage(null);
    setAdding(true);
  }

  function handleChanged(text: string) {
    setAdding(false);
    setMessage(text);
    void loadAccounts();
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-8">
        <p className="section-label flex-1">Команда</p>
        {!adding && (
          <button
            type="button"
            onClick={() => startAdding()}
            className="inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-5 py-3
                       hover:bg-ink-800 transition-colors shrink-0"
          >
            + Добавить сотрудника
          </button>
        )}
      </div>

      {adding && (
        <BaristaAccountForm
          key={prefillName}
          initialName={prefillName}
          onCreated={handleChanged}
          onCancel={() => setAdding(false)}
        />
      )}

      {message && (
        <p role="status" className="mb-6 text-sm text-ink-700">
          {message}
        </p>
      )}

      <p className="section-label mb-4">Учётки сотрудников</p>
      {loadError ? (
        <p role="alert" className="text-sm text-rating mb-10">
          {loadError}
        </p>
      ) : accounts === null ? (
        <p className="text-sm text-ink-500 mb-10">Загружаем…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-ink-500 mb-10">Учёток пока нет. Нажмите «+ Добавить сотрудника».</p>
      ) : (
        <BaristaAccountsList accounts={accounts} ratings={ratings} onChanged={handleChanged} />
      )}

      {cards.length > 0 && (
        <>
          <p className="section-label mb-4">Карточки команды</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {cards.map((member) => {
              const rating = ratings.get(member.id);
              const browserOnly = isBrowserOnlyStaff(member.id);
              return (
                <div key={member.id} className="flex flex-col gap-2">
                  <StaffCard member={member} averageRating={rating?.average ?? 0} ratingCount={rating?.count ?? 0} />
                  {browserOnly && (
                    <div className="text-center text-xs text-ink-500">
                      <p>Сохранено только в этом браузере.</p>
                      <button
                        type="button"
                        onClick={() => startAdding(member.name)}
                        className="mt-1 text-ink-700 underline underline-offset-2 hover:text-ink-900"
                      >
                        Создать учётку
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
