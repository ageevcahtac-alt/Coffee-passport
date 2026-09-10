// Guards every `next=...` query/form param that ends up inside a
// redirect() / NextResponse.redirect() call across the auth flow
// (app/auth/actions.ts, app/auth/callback/route.ts, app/auth/login/page.tsx)
// against becoming an open redirect. `next` is attacker-controlled input
// (a query string param on a public URL) — without this, a value like
// "//evil.com" or "https://evil.com" would be accepted as-is and, once
// concatenated after a real login, send the guest off-site.
//
// Only a same-origin, absolute-from-root path is ever allowed; anything
// else (empty, protocol-relative "//host", an absolute URL, a bare
// relative segment) falls back to "/".
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  if (next.includes('://')) return '/'
  return next
}
