'use client';

import { useState, type FormEvent } from 'react';
import { syncBaristaProfilesFromSupabase } from '@/lib/data/baristaProfileStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join('');
}

// Cafe gives a barista their own login: email + temporary password, which
// the barista replaces on first sign-in (see app/auth/change-password).
// The cafe hands both over in person; nothing is emailed.
export function BaristaAccountForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/cafe/staff/barista-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, temporaryPassword: password }),
      });
      const result = (await response.json().catch(() => ({}))) as { email?: string; error?: string };
      if (response.ok) {
        setMessage({
          kind: 'ok',
          text: `Учётка ${result.email} создана. Передайте бариста email и временный пароль — при первом входе он задаст свой.`,
        });
        setName('');
        setEmail('');
        setPassword('');
        void syncBaristaProfilesFromSupabase();
      } else {
        setMessage({ kind: 'error', text: result.error ?? 'Не удалось создать учётку.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Нет связи с сервером. Попробуйте ещё раз.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-ink-200 bg-parchment-100 p-5 mb-10">
      <p className="section-label mb-2">Доступ в кабинет бариста</p>
      <p className="text-sm text-ink-500 mb-4">
        Бариста войдёт по этому email и временному паролю, сменит пароль и откроет скан лояльности.
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
          placeholder="Email бариста"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <div className="flex gap-2">
          <input
            id="barista-temporary-password"
            type="text"
            autoComplete="off"
            className={fieldClasses}
            placeholder="Временный пароль (от 12 символов)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            required
          />
          <button
            type="button"
            onClick={() => setPassword(generatePassword())}
            className="shrink-0 rounded-md border border-ink-200 px-3 text-sm text-ink-700 hover:text-ink-900"
          >
            Сгенерировать
          </button>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ink-900 text-parchment-100 font-body font-medium text-sm px-5 py-3
                     hover:bg-ink-800 transition-colors disabled:opacity-50"
        >
          {busy ? 'Создаём…' : 'Создать доступ'}
        </button>
      </form>
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-ink-700' : 'text-rating'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
