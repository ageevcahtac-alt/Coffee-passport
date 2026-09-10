import { EnthusiastAuthForm } from '@/components/site/EnthusiastAuthForm';

// GAP 1 (IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md) — this page used to
// render its own login-only form, with no path to create an account at
// all. The Navbar's "Log in" link (visible on every (site) page, including
// the Public Passport) pointed here, so a brand-new guest clicking it hit
// a dead end unless they already knew to go back to the homepage for
// EnthusiastAuthForm's signup tab. Reusing that exact component here
// —no new auth form — gives every "Log in" link a real signup path too,
// and `next` (now also read here) lets a signed-up/logged-in guest return
// to wherever they actually came from (e.g. the Lot's own Passport)
// instead of always landing on /journey.
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = searchParams.next ?? '/';
  // Preserve `next` across a failed attempt too, so retrying after a typo
  // doesn't lose the original return context.
  const errorRedirect = next === '/' ? '/auth/login' : `/auth/login?next=${encodeURIComponent(next)}`;

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 bg-parchment-200">
      <div className="max-w-sm mx-auto w-full">
        <span className="text-xs uppercase tracking-widest2 text-ink-400 font-body">
          Coffee Passport
        </span>
        <h1 className="font-display text-3xl text-ink-900 mt-3 mb-2">Войти или создать аккаунт</h1>
        <p className="text-ink-500 text-sm mb-8">
          Одна и та же форма для входа в уже существующий аккаунт или для регистрации нового.
        </p>

        <EnthusiastAuthForm error={searchParams.error} next={next} errorRedirect={errorRedirect} />
      </div>
    </main>
  );
}
