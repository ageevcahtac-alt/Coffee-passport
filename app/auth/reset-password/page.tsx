'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

export default function ResetPasswordPage() {
  const started = useRef(false);
  const [identity, setIdentity] = useState<{ id: string; email: string } | null>(null);
  const [message, setMessage] = useState('Проверяем ссылку восстановления…');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const tokenHash = new URLSearchParams(window.location.hash.slice(1)).get('token_hash');
    // A fragment is not sent to HTTP servers, access logs or referrers. Remove
    // it from browser history before exchanging it through the Auth POST API.
    window.history.replaceState(null, '', window.location.pathname);
    if (!tokenHash) {
      setMessage('Откройте одноразовую ссылку восстановления пароля.');
      return;
    }
    void (async () => {
      try {
        const { data, error } = await getBrowserSupabaseClient().auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (error || !data.user?.email || !data.session) {
          setMessage('Ссылка недействительна или истекла. Запросите новую ссылку восстановления.');
          return;
        }
        setIdentity({ id: data.user.id, email: data.user.email });
        setMessage('Задайте новый пароль для своего аккаунта.');
      } catch {
        setMessage('Не удалось проверить ссылку. Проверьте соединение и запросите новую ссылку.');
      }
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity || busy) return;
    if (password.length < 12 || password !== confirmation) {
      setMessage('Пароль должен содержать не менее 12 символов. Оба поля должны совпадать.');
      return;
    }
    setBusy(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { data: current, error: currentError } = await supabase.auth.getUser();
      if (currentError || current.user?.id !== identity.id) {
        setMessage('Сессия восстановления завершилась. Откройте новую ссылку.');
        setIdentity(null);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage('Не удалось сохранить пароль. Выберите другой пароль или запросите новую ссылку.');
        return;
      }
      const login = await supabase.auth.signInWithPassword({ email: identity.email, password });
      setPassword('');
      setConfirmation('');
      if (login.error || login.data.user?.id !== identity.id) {
        setMessage('Пароль сохранён. Проверьте вход через страницу авторизации.');
        setIdentity(null);
        return;
      }
      setComplete(true);
      setMessage('Пароль сохранён, вход проверен. Вы вошли в свой аккаунт.');
    } catch {
      setMessage('Соединение прервалось. Проверьте вход с новым паролем перед повторной попыткой.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-parchment-200 px-6">
      <div className="w-full max-w-sm rounded-md border border-ink-200 bg-parchment-100 p-6">
        <p className="text-xs uppercase tracking-widest text-ink-400">Coffee Passport</p>
        <h1 className="mt-3 mb-4 font-display text-3xl text-ink-900">Новый пароль</h1>
        <p role="status" aria-live="polite" className="mb-5 text-sm text-ink-600">{message}</p>
        {identity && !complete && (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="text-sm text-ink-700">Новый пароль
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required
                value={password} onChange={event => setPassword(event.target.value)} disabled={busy}
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2" />
            </label>
            <label className="text-sm text-ink-700">Повторите пароль
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required
                value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2" />
            </label>
            <button type="submit" disabled={busy} className="rounded-md bg-ink-900 px-4 py-3 text-parchment-100 disabled:opacity-50">
              {busy ? 'Сохраняем…' : 'Сохранить пароль'}
            </button>
          </form>
        )}
        {complete && <Link href="/journey" className="text-sm underline">Открыть Coffee Passport</Link>}
        {!identity && <Link href="/auth/login" className="text-sm underline">Перейти ко входу</Link>}
      </div>
    </main>
  );
}
