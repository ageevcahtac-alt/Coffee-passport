import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Стандартное обновление сессии @supabase/ssr: истёкший access-токен
// меняется по refresh-токену, новые cookie уходят и в серверный рендер этого
// запроса, и в браузер. Без этого серверные компоненты не могут записать
// cookie (lib/supabase/server.ts глотает ошибку), и вход «слетает».
// Вход живёт до «Выйти» (app/auth/actions.ts signOut).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Ничего не ставить между созданием клиента и getUser(): именно он обновляет токен.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|tiles/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
