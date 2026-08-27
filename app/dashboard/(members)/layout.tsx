import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/auth/actions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests, but a direct
  // render (e.g. RSC prefetch) should be safe on its own too.
  if (!user) {
    redirect('/auth/login?next=/dashboard');
  }

  const { data: memberships } = await supabase
    .from('roaster_members')
    .select('roaster_id, role, roasters(name, slug)')
    .eq('user_id', user.id);

  if (!memberships || memberships.length === 0) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 bg-parchment-200 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">No roaster access</h1>
        <p className="text-ink-500 text-sm max-w-xs mb-6">
          This account isn't linked to a roaster yet. Ask your roaster admin to add you,
          or contact support if you think this is a mistake.
        </p>
        <div className="flex gap-3">
          <Link href="/" className="text-sm text-ink-700 underline">
            Back home
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-ink-700 underline">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  // MVP: first membership is treated as the active roaster context.
  // Multi-roaster-per-user switching is a future enhancement, not MVP scope.
  const activeRoaster = memberships[0];

  return (
    <div className="min-h-dvh bg-parchment-100">
      <header className="border-b border-ink-100 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest2 text-ink-400">Dashboard</span>
          <h1 className="font-display text-lg text-ink-900 leading-tight">
            {((activeRoaster as any)?.roasters as { name: string })?.name ?? 'Roaster'}
          </h1>
        </div>
        <nav className="flex items-center gap-4 text-sm text-ink-500">
          <Link href="/dashboard" className="hover:text-ink-900">Overview</Link>
          <Link href="/dashboard/coffees" className="hover:text-ink-900">Coffees</Link>
          <Link href="/dashboard/qr" className="hover:text-ink-900">QR codes</Link>
          <form action={signOut}>
            <button type="submit" className="hover:text-ink-900">Sign out</button>
          </form>
        </nav>
      </header>
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}