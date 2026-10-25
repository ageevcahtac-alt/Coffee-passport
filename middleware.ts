import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// /admin and /api/admin/** are gated by role admin in app/admin/layout.tsx and
// lib/auth/requireAdminApi.ts. Transition: a request without a Supabase session
// cookie still gets the old Basic challenge; with one it goes on to the role check.
export function middleware(req: NextRequest) {
  if (req.cookies.getAll().some((cookie) => /^sb-.+-auth-token/.test(cookie.name))) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const authValues = authHeader.split(' ')[1];
    const [user, pwd] = atob(authValues).split(':');

    const validUser = process.env.ADMIN_USER || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD;

    if (user === validUser && pwd === validPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Требуется авторизация', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Admin Area"',
    },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
