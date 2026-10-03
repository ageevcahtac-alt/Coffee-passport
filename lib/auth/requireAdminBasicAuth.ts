import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

// Node-only: do not import this gate into the Edge middleware or client UI.
if (typeof window !== 'undefined') {
  throw new Error('requireAdminBasicAuth is server-only.');
}

function equalSecret(actual: string, expected: string): boolean {
  // Fixed-size digests avoid both length exceptions and early string comparison.
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

export function requireAdminBasicAuth(input: Request | Headers): NextResponse | null {
  const password = process.env.ADMIN_PASSWORD;
  const header = ('headers' in input ? input.headers : input).get('authorization');
  if (password && header) {
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
    if (match) {
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator >= 0) {
        const validUser = equalSecret(decoded.slice(0, separator), process.env.ADMIN_USER ?? 'admin');
        const validPassword = equalSecret(decoded.slice(separator + 1), password);
        if (validUser && validPassword) return null;
      }
    }
  }
  return new NextResponse('Требуется авторизация', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Admin Area"' },
  });
}
