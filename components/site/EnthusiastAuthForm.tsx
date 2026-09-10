'use client';

import { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '@/app/auth/actions';

const fieldClasses =
  'rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Default entry point on the landing page — Кофейный энтузиаст only (see
// app/(site)/page.tsx). Coffee shop / roaster accounts are onboarded
// through BecomePartnerSection's lead form below this, not through
// self-serve signup.
//
// Also reused, unchanged in behavior for the homepage, by /auth/login (see
// IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md) — the only previously-
// missing signup path reachable from a guest already on the Public
// Passport. `next`/`errorRedirect` default to this component's original
// hardcoded values, so the homepage call site (which passes neither) is
// byte-for-byte unaffected; /auth/login passes both so a successful
// login/signup returns the guest to wherever they came from instead of
// always landing on /journey.
export function EnthusiastAuthForm({
  error,
  next = '/journey',
  errorRedirect = '/',
}: {
  error?: string;
  next?: string;
  errorRedirect?: string;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="max-w-sm mx-auto w-full rounded-md border border-ink-200 bg-parchment-100 p-6">
      <div className="flex rounded-md border border-ink-200 p-1 mb-6">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 rounded-md py-2 text-sm font-body font-medium transition-colors
                      ${mode === 'login' ? 'bg-ink-900 text-parchment-100' : 'text-ink-500'}`}
        >
          Войти
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`flex-1 rounded-md py-2 text-sm font-body font-medium transition-colors
                      ${mode === 'signup' ? 'bg-ink-900 text-parchment-100' : 'text-ink-500'}`}
        >
          Регистрация
        </button>
      </div>

      <form
        action={mode === 'login' ? signInWithPassword : signUpWithPassword}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="errorRedirect" value={errorRedirect} />

        <label htmlFor="enthusiast-email" className="text-xs uppercase tracking-widest2 text-ink-400">
          Email
        </label>
        <input
          id="enthusiast-email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className={fieldClasses}
        />

        <label
          htmlFor="enthusiast-password"
          className="text-xs uppercase tracking-widest2 text-ink-400 mt-1"
        >
          Пароль
        </label>
        <input
          id="enthusiast-password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
          className={fieldClasses}
        />

        {error && <p className="text-sm text-rating">{error}</p>}

        <button
          type="submit"
          className="mt-3 inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          {mode === 'login' ? 'Войти в дневник вкуса' : 'Создать аккаунт энтузиаста'}
        </button>
      </form>
    </div>
  );
}
