import { Navbar } from '@/components/shared/Navbar';
import { createClient } from '@/lib/supabase/server';
import { CurrentUserProvider } from '@/lib/auth/currentUser';

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CurrentUserProvider authUserId={user?.id ?? null}>
      <Navbar userEmail={user?.email ?? null} />
      {children}
    </CurrentUserProvider>
  );
}