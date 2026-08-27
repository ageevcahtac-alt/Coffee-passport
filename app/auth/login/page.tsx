import { signInWithPassword } from '../actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; sent?: string; error?: string };
}) {
  const next = searchParams.next ?? '/';

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 bg-parchment-200">
      <div className="max-w-sm mx-auto w-full">
        <span className="text-xs uppercase tracking-widest2 text-ink-400 font-body">
          Coffee Passport
        </span>
        <h1 className="font-display text-3xl text-ink-900 mt-3 mb-2">Log in</h1>
        <p className="text-ink-500 text-sm mb-8">
          Enter your email and password to sign in.
        </p>

        <form action={signInWithPassword} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          
          <label htmlFor="email" className="text-xs uppercase tracking-widest2 text-ink-400">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm
                       text-ink-900 placeholder:text-ink-300 focus:border-gold-400"
          />

          <label htmlFor="password" className="text-xs uppercase tracking-widest2 text-ink-400 mt-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm
                       text-ink-900 placeholder:text-ink-300 focus:border-gold-400"
          />

          {searchParams.error && (
            <p className="text-sm text-rating">{searchParams.error}</p>
          )}

          <button
            type="submit"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4
                       hover:bg-ink-800 transition-colors"
          >
            Log in
          </button>
        </form>
      </div>
    </main>
  );
}