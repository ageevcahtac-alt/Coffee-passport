import Link from 'next/link';
import { signOut } from '@/app/auth/actions';
import { EnthusiastFeedbackWidget } from './EnthusiastFeedbackWidget';

export function Navbar({ userEmail }: { userEmail: string | null }) {
  return (
    <header className="px-6 py-4 flex items-start justify-between border-b border-ink-100/0">
      <Link href="/" className="text-xs uppercase tracking-widest2 text-ink-400 font-body">
        Coffee Passport
      </Link>
      <div className="flex flex-col items-end gap-1.5">
        <nav className="flex items-center gap-4 text-sm text-ink-500">
          <Link href="/map" className="hover:text-ink-900">🗺️ Карта кофеен</Link>
          <Link href="/top-recipes" className="hover:text-ink-900">Топовые рецепты</Link>
          {userEmail ? (
            <>
              <Link href="/journey" className="hover:text-ink-900">Journey</Link>
              <Link href="/journey" className="hover:text-ink-900">My taste</Link>
              <form action={signOut}>
                <button type="submit" className="hover:text-ink-900">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/auth/login" className="hover:text-ink-900">Log in</Link>
          )}
        </nav>
        {/* Right under Log in/Sign out — reachable from every guest-facing
            page via this shared header, not just /journey. */}
        <EnthusiastFeedbackWidget />
      </div>
    </header>
  );
}
