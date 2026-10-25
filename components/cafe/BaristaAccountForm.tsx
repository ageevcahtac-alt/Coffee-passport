'use client';

import { useState, type FormEvent } from 'react';
import { syncBaristaProfilesFromSupabase } from '@/lib/data/baristaProfileStore';

export const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join('');
}

export function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function TemporaryPasswordInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="text"
        autoComplete="off"
        className={fieldClasses}
        placeholder="Временный пароль (от 12 символов)"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        minLength={12}
        maxLength={128}
        required
      />
      <button
        type="button"
        onClick={() => onChange(generatePassword())}
        className="shrink-0 rounded-md border border-ink-200 px-3 text-sm text-ink-700 hover:text-ink-900"
      >
        Сгенерировать
      </button>
    </div>
  );
}

// «+ Добавить сотрудника» → a real login right away: email + temporary
// password (72 hours), which the barista replaces on first sign-in (see
// app/auth/change-password). The cafe hands both over in person; nothing is
// emailed.
export function BaristaAccountForm({
  initialName = '',
  onCreated,
  onCancel,
}: {
  initialName?: string;
  onCreated: (message: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/cafe/staff/barista-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, temporaryPassword: password }),
      });
      const result = (await response.json().catch(() => ({}))) as { email?: string; expiresAt?: string; error?: string };
      if (response.ok) {
        void syncBaristaProfilesFromSupabase();
        onCreated(
          `Учётка ${result.email} создана. Передайте бариста email и временный пароль — он действует до ` +
            `${result.expiresAt ? formatExpiry(result.expiresAt) : 'истечения 72 часов'}, при первом входе бариста задаст свой.`
        );
      } else {
        setError(result.error ?? 'Не удалось создать учётку.');
      }
    } catch {
      setError('Нет связи с сервером. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-ink-200 bg-parchment-100 p-5 mb-8">
      <p className="section-label mb-2">Новый сотрудник</p>
      <p className="text-sm text-ink-500 mb-4">
        Сотрудник войдёт по этому email и временному паролю, задаст свой пароль и откроет кабинет бариста.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" data-testid="barista-account-form">
        <input
          id="barista-name"
          className={fieldClasses}
          placeholder="Имя"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
        />
        <input
          id="barista-email"
          type="email"
          autoComplete="off"
          className={fieldClasses}
          placeholder="Email сотрудника"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TemporaryPasswordInput id="barista-temporary-password" value={password} onChange={setPassword} />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-md bg-ink-900 text-parchment-100 font-body font-medium text-sm px-5 py-3
                       hover:bg-ink-800 transition-colors disabled:opacity-50"
          >
            {busy ? 'Создаём…' : 'Создать учётку'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-ink-200 px-4 text-sm text-ink-700 hover:text-ink-900"
          >
            Отмена
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rating">
          {error}
        </p>
      )}
    </section>
  );
}
