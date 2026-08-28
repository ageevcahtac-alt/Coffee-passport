import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Same HTTP Basic Auth gate covers the /admin pages themselves AND their
// API routes (app/api/admin/**) — the CRM UI is useless without the data
// calls behind it also being protected.
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api/admin')) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
