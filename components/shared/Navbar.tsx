import Link from 'next/link';
import { signOut } from '@/app/auth/actions';

export function Navbar({ userEmail }: { userEmail: string | null }) {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-ink-100/0">
      <Link href="/" className="text-xs uppercase tracking-widest2 text-ink-400 font-body">
        Coffee Passport
      </Link>
      <nav className="flex items-center gap-4 text-sm text-ink-500">
        {userEmail ? (
          <>
            <Link href="/journey" className="hover:text-ink-900">Journey</Link>
            <Link href="/taste" className="hover:text-ink-900">My taste</Link>
            <form action={signOut}>
              <button type="submit" className="hover:text-ink-900">Sign out</button>
            </form>
          </>
        ) : (
          <Link href="/auth/login" className="hover:text-ink-900">Log in</Link>
        )}
      </nav>
    </header>
  );
}