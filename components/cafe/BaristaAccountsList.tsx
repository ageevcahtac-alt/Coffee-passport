'use client';

import { useState, type FormEvent } from 'react';
import { StaffAvatar } from './StaffAvatar';
import { TemporaryPasswordInput, formatExpiry } from './BaristaAccountForm';

export type BaristaAccount = {
  baristaId: string;
  name: string;
  email: string;
  status: 'active' | 'pending' | 'expired';
  expiresAt: string | null;
};

function statusText(account: BaristaAccount): string {
  if (account.status === 'active') return 'Вход открыт';
  if (account.status === 'expired') return 'Временный пароль истёк';
  return `Ждёт смены пароля · временный до ${formatExpiry(account.expiresAt!)}`;
}

// Logins the cafe created (GET /api/cafe/staff/barista-accounts) with their
// temporary-password status and «Выдать новый временный пароль» (PATCH):
// after 72 hours, or when the barista forgot their password.
export function BaristaAccountsList({
  accounts,
  ratings,
  onChanged,
}: {
  accounts: BaristaAccount[];
  ratings: Map<string, { average: number; count: number }>;
  onChanged: (message: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-3 mb-10" data-testid="barista-accounts">
      {accounts.map((account) => (
        <AccountRow key={account.baristaId} account={account} rating={ratings.get(account.baristaId)} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function AccountRow({
  account,
  rating,
  onChanged,
}: {
  account: BaristaAccount;
  rating?: { average: number; count: number };
  onChanged: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/cafe/staff/barista-accounts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baristaId: account.baristaId, temporaryPassword: password }),
      });
      const result = (await response.json().catch(() => ({}))) as { expiresAt?: string; error?: string };
      if (response.ok && result.expiresAt) {
        setOpen(false);
        setPassword('');
        onChanged(
          `Новый временный пароль для ${account.name} действует до ${formatExpiry(result.expiresAt)}. ` +
            'Передайте его бариста — прежний пароль больше не работает.'
        );
      } else {
        setError(result.error ?? 'Не удалось выдать пароль.');
      }
    } catch {
      setError('Нет связи с сервером. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-ink-200 bg-parchment-100 p-4" data-barista-id={account.baristaId}>
      <div className="flex items-center gap-4">
        <StaffAvatar name={account.name} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-ink-900 leading-tight">{account.name}</p>
          <p className="text-xs text-ink-500 truncate">{account.email}</p>
          <p className={`text-xs mt-1 ${account.status === 'expired' ? 'text-rating' : 'text-ink-400'}`}>
            {statusText(account)}
            {rating && rating.count > 0 && ` · ★ ${rating.average.toFixed(1)} · ${rating.count} оценок`}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Выдать новый временный пароль
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
          <TemporaryPasswordInput id={`reissue-${account.baristaId}`} value={password} onChange={setPassword} />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-md bg-ink-900 text-parchment-100 text-sm font-medium px-5 py-3
                         hover:bg-ink-800 transition-colors disabled:opacity-50"
            >
              {busy ? 'Выдаём…' : 'Выдать пароль'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-md border border-ink-200 px-4 text-sm text-ink-700 hover:text-ink-900"
            >
              Отмена
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-rating">
              {error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
