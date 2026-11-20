import { beforeEach, describe, expect, it, vi } from 'vitest';

// Пакет №4 — ежедневная архивация: прошедшие события уходят в архив (как
// раньше), заодно ссылки активных событий из авто-источников (source !=
// 'manual' — кураторская лента, ICS) перепроверяются: битая обнуляется.
// Ручные админские записи запрос не отдаёт (фильтр neq на уровне БД) — роут
// их не трогает по построению. Без jsdom/сервера: роут вызван напрямую.

let activeAutoRows: { id: string; link: string }[] = [];
const blankedUpdates: { id: string; patch: Record<string, unknown> }[] = [];

vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => ({
    rpc: (fn: string) => {
      expect(fn).toBe('events_archive_expired');
      return Promise.resolve({ data: 3, error: null });
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            neq: () => ({
              neq: () => {
                expect(table).toBe('events');
                return Promise.resolve({ data: activeAutoRows, error: null });
              },
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          expect(column).toBe('id');
          blankedUpdates.push({ id: String(value), patch });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function cronRequest(): Request {
  return new Request('http://localhost/api/cron/events-archive', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('POST /api/cron/events-archive (пакет №4)', () => {
  beforeEach(() => {
    activeAutoRows = [];
    blankedUpdates.length = 0;
    vi.resetModules();
    process.env.EVENTS_CRON_SECRET = 'test-cron-secret';
  });

  it('живая ссылка остаётся, битая обнуляется', async () => {
    activeAutoRows = [
      { id: 'evt-alive', link: 'https://opencoffeefest.ru' },
      { id: 'evt-dead', link: 'https://dead.example.com/fest' },
    ];
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('dead')
        ? ({ ok: false, status: 404 } as Response)
        : ({ ok: true, status: 200 } as Response)
    );

    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(body.archived).toBe(3);
    expect(body.deadLinksBlanked).toBe(1);
    expect(blankedUpdates).toHaveLength(1);
    expect(blankedUpdates[0].id).toBe('evt-dead');
    expect(blankedUpdates[0].patch.link).toBe('');
  });

  it('HEAD не отдают (405/403) → перепроверка GET, по живому ответу ссылка остаётся', async () => {
    activeAutoRows = [{ id: 'evt-headless', link: 'https://example.com/fest' }];
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) =>
      init?.method === 'HEAD'
        ? ({ ok: false, status: 403 } as Response)
        : ({ ok: true, status: 200 } as Response)
    );

    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(body.deadLinksBlanked).toBe(0);
    expect(blankedUpdates).toHaveLength(0);
  });

  it('без секрета крона — 401', async () => {
    process.env.EVENTS_CRON_SECRET = '';
    const { POST } = await import('./route');
    const response = await POST(cronRequest());

    expect(response.status).toBe(401);
    expect(blankedUpdates).toHaveLength(0);
  });
});
