import { Navbar } from '@/components/shared/Navbar';
import { getSiteSession } from '@/lib/auth/siteSession';
import { CurrentUserProvider } from '@/lib/auth/currentUser';

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSiteSession();

  return (
    <CurrentUserProvider authUserId={session?.userId ?? null}>
      <Navbar session={session ? { role: session.role } : null} />
      {children}
    </CurrentUserProvider>
  );
}