import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/safeRedirect';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Next.js may expose localhost as request.url behind the production proxy.
  // Nginx overwrites Host and X-Forwarded-Proto; restrict production hosts.
  const host = request.headers.get('host');
  const publicHosts = new Set(['coffeepassport.ru', '147.45.102.186']);
  const origin = host && publicHosts.has(host)
    ? `https://${host}`
    : new URL(request.url).origin;
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent('That login link is invalid or expired.')}`
  );
}
