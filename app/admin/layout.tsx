import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdminBasicAuth } from '@/lib/auth/requireAdminBasicAuth';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware issues the Basic challenge; this independent gate also denies
  // rendering when middleware is bypassed. Layouts cannot return HTTP responses.
  if (requireAdminBasicAuth(headers())) redirect('/');
  return children;
}
