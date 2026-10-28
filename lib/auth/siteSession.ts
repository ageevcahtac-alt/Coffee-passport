import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRole } from '@/lib/types/database';

export interface SiteSession {
  userId: string;
  email: string;
  role: ProfileRole;
}

// Кто вошёл — по cookie сессии Supabase (её обновляет middleware.ts), роль —
// из profiles. Один раз на запрос: layout (меню) и главная зовут одно и то же.
// Профиля нет (триггер ещё не создал) — считаем энтузиастом, как триггер.
export const getSiteSession = cache(async (): Promise<SiteSession | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { userId: user.id, email: user.email ?? '', role: (profile?.role as ProfileRole | undefined) ?? 'enthusiast' };
});
