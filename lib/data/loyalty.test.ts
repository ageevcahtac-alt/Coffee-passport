import { beforeEach, describe, expect, it, vi } from 'vitest';

// Регрессионные тесты data-слоя лояльности (баг «display_name слетает»):
// свой профиль ЛК читается БЕЗ ролевого фильтра (staff-аккаунты тоже должны
// видеть своё имя после перезахода), а staff-чтение чужой карты после
// скана QR — С фильтром role='enthusiast' (это разные политики, 0007/0012).

interface RecordedQuery {
  table: string;
  select: string | null;
  eqs: [string, unknown][];
  update: Record<string, unknown> | null;
}

const recorded: RecordedQuery[] = [];

let authUser: { id: string } | null = { id: 'user-1' };
let profileRow: Record<string, unknown> | null = null;
let writeError: { message: string } | null = null;

function makeQuery(rec: RecordedQuery): unknown {
  const chain: Record<string, unknown> = {
    select(cols: string) {
      rec.select = cols;
      return chain;
    },
    eq(column: string, value: unknown) {
      rec.eqs.push([column, value]);
      return chain;
    },
    in() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({ data: profileRow, error: profileRow ? null : { message: 'row not found' } });
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) {
      // .update(...).eq(...) await'ится как промис — разрешаем результатом записи.
      return Promise.resolve({ error: writeError }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

// from() возвращает прокси-чейн: перехватываем update() (запоминаем patch),
// остальное — методы чейна; await чейна резолвится в { error } записи.
vi.mock('@/lib/supabase/browserClient', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: authUser }, error: null }),
    },
    from(table: string) {
      const rec: RecordedQuery = { table, select: null, eqs: [], update: null };
      recorded.push(rec);
      const base = makeQuery(rec) as { [key: string]: unknown };
      return new Proxy(base, {
        get(target, prop) {
          if (prop === 'update') {
            return (patch: Record<string, unknown>) => {
              rec.update = patch;
              return target;
            };
          }
          return target[prop as keyof typeof target];
        },
      });
    },
  }),
}));

describe('loyalty data layer — own profile vs staff guest lookup', () => {
  beforeEach(() => {
    recorded.length = 0;
    authUser = { id: 'user-1' };
    profileRow = null;
    writeError = null;
  });

  it('fetchOwnProfile читает свой профиль без ролевого фильтра', async () => {
    profileRow = {
      id: 'user-1',
      display_name: 'Михаил',
      email: 'owner@test.com',
      phone: '+7 (900) 123-45-67',
      city: 'Санкт-Петербург',
      favorite_drink: 'Флэт уайт',
    };
    const loyalty = await import('./loyalty');
    const profile = await loyalty.fetchOwnProfile();

    expect(profile?.displayName).toBe('Михаил');
    expect(profile?.favoriteDrink).toBe('Флэт уайт');
    const rec = recorded.find((r) => r.table === 'profiles');
    expect(rec).toBeDefined();
    expect(rec!.eqs).toContainEqual(['id', 'user-1']);
    // Корень бага «имя слетает»: прежний код читал через fetchGuestProfile,
    // у которой eq(role, 'enthusiast') молча давал null для staff-аккаунта.
    expect(rec!.eqs.some(([column]) => column === 'role')).toBe(false);
    expect(rec!.select).toContain('favorite_drink');
  });

  it('fetchGuestProfile сохраняет фильтр role=enthusiast (staff читает карту гостя)', async () => {
    profileRow = {
      id: 'guest-9',
      display_name: 'Аня',
      email: 'guest@test.com',
      favorite_drink: null,
    };
    const loyalty = await import('./loyalty');
    const profile = await loyalty.fetchGuestProfile('guest-9');

    expect(profile?.displayName).toBe('Аня');
    const rec = recorded.find((r) => r.table === 'profiles');
    expect(rec!.eqs).toContainEqual(['id', 'guest-9']);
    expect(rec!.eqs).toContainEqual(['role', 'enthusiast']);
  });

  it('updateOwnProfile пишет четыре self-editable колонки своей строки', async () => {
    const loyalty = await import('./loyalty');
    const result = await loyalty.updateOwnProfile({
      displayName: ' Михаил ',
      phone: '+7 (900) 123-45-67',
      city: ' Санкт-Петербург ',
      favoriteDrink: 'Флэт уайт',
    });

    expect(result.ok).toBe(true);
    const rec = recorded.find((r) => r.table === 'profiles');
    expect(rec!.update).toEqual({
      display_name: 'Михаил',
      phone: '+7 (900) 123-45-67',
      city: 'Санкт-Петербург',
      favorite_drink: 'Флэт уайт',
    });
    expect(rec!.eqs).toContainEqual(['id', 'user-1']);
  });

  it('updateOwnProfile сохраняет пустые поля как null', async () => {
    const loyalty = await import('./loyalty');
    const result = await loyalty.updateOwnProfile({
      displayName: '',
      phone: '',
      city: '',
      favoriteDrink: '',
    });

    expect(result.ok).toBe(true);
    const rec = recorded.find((r) => r.table === 'profiles');
    expect(rec!.update).toEqual({
      display_name: null,
      phone: null,
      city: null,
      favorite_drink: null,
    });
  });

  it('updateOwnProfile сообщает ошибку записи вместо молчания', async () => {
    writeError = { message: 'RLS denied' };
    const loyalty = await import('./loyalty');
    const result = await loyalty.updateOwnProfile({
      displayName: 'Михаил',
      phone: '',
      city: '',
      favoriteDrink: '',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('RLS denied');
  });

  it('без сессии updateOwnProfile отказывает без запроса к БД', async () => {
    authUser = null;
    const loyalty = await import('./loyalty');
    const result = await loyalty.updateOwnProfile({
      displayName: 'Михаил',
      phone: '',
      city: '',
      favoriteDrink: '',
    });

    expect(result.ok).toBe(false);
    expect(recorded.find((r) => r.table === 'profiles')).toBeUndefined();
  });
});
