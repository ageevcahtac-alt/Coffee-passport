import { Navbar } from '@/components/shared/Navbar';
import { createClient } from '@/lib/supabase/server';

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
    <>
      <Navbar userEmail={user?.email ?? null} />
      {children}
    </>
  );
}