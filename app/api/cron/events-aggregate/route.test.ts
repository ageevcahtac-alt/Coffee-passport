import { beforeEach, describe, expect, it, vi } from 'vitest';

// Пакет №4 — ежедневный агрегатор афиши: (1) битая ссылка кандидата
// обнуляется до записи (мёртвых ссылок на витрине нет); (2) после ingestion
// кураторская лента добирает активные события до MIN_ACTIVE_EVENTS, даже
// когда внешних ICS-источников нет вовсе. Без jsdom/сервера: роут вызван
// напрямую, adminClient и fetch замоканы.

const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];
const insertedRows: Record<string, unknown>[] = [];
const updatedRows: { id: string; status?: unknown }[] = [];
const existingRows: { id: string; title: string; start_date: string; status: string }[] = [];
let insertError: { message: string } | null = null;
let activeCount = 0;

vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => ({
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      return Promise.resolve({ data: true, error: null });
    },
    from: (table: string) => ({
      select: (columns: string, options?: { count?: string; head?: boolean }) => {
        expect(table).toBe('events');
        if (options?.head) {
          return {
            eq: () => ({
              gte: () => Promise.resolve({ count: activeCount, error: null }),
            }),
          };
        }
        return {
          then: (onFulfilled: (value: { data: unknown; error: null }) => unknown) =>
            onFulfilled({ data: existingRows, error: null }),
        };
      },
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return Promise.resolve({ error: insertError });
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          expect(column).toBe('id');
          updatedRows.push({ id: String(value), status: patch.status });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const ICS_FEED = 'https://feed.example.com/coffee.ics';
const ICS_BODY = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Test Coffee Fest',
  'LOCATION:Москва',
  'DESCRIPTION:Тестовое событие',
  'DTSTART:20270301',
  'DTEND:20270302',
  'URL:https://dead.example.com/event',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function cronRequest(): Request {
  return new Request('http://localhost/api/cron/events-aggregate', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('POST /api/cron/events-aggregate (пакет №4)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    insertedRows.length = 0;
    updatedRows.length = 0;
    existingRows.length = 0;
    insertError = null;
    activeCount = 0;
    vi.resetModules();
    process.env.EVENTS_CRON_SECRET = 'test-cron-secret';
    process.env.EVENT_SOURCE_ICS_URLS = ICS_FEED;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === ICS_FEED) {
        return { ok: true, status: 200, text: () => Promise.resolve(ICS_BODY) } as Response;
      }
      // Все прочие URL (проверки ссылок) — мёртвые.
      return { ok: false, status: 404 } as Response;
    });
  });

  it('битая ссылка кандидата обнуляется до записи в events_ingest_candidate', async () => {
    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(body.sourcesConfigured).toBe(1);
    expect(body.candidatesSeen).toBe(1);
    expect(body.deadLinksBlanked).toBe(1);
    const call = rpcCalls.find((entry) => entry.fn === 'events_ingest_candidate');
    expect(call).toBeDefined();
    expect(call!.params.p_link).toBe('');
    expect(call!.params.p_title).toBe('Test Coffee Fest');
  });

  it('top-up: pending_review с ключом каталога повышается до active, дубль не вставляется', async () => {
    activeCount = 3;
    existingRows.push(
      { id: 'p1', title: 'Open Coffee Fest', start_date: '2026-12-05', status: 'pending_review' }
    );
    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(body.curatedTopUp.error).toBeNull();
    expect(body.curatedTopUp.promoted).toBe(1);
    expect(body.curatedTopUp.activeCount).toBe(4);
    expect(updatedRows).toEqual([{ id: 'p1', status: 'active' }]);
    // Добор остановился на минимуме: ОГОНЁК не вставляли.
    expect(insertedRows).toHaveLength(0);
  });

  it('top-up: ошибки вставки уходят в отчёт прогона, а не проглатываются', async () => {
    activeCount = 0;
    insertError = { message: 'connection reset' };
    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(Array.isArray(body.curatedTopUp.errors)).toBe(true);
    expect(body.curatedTopUp.errors.length).toBeGreaterThan(0);
    expect(body.curatedTopUp.errors[0]).toContain('connection reset');
  });

  it('top-up: меньше минимума → добирает ближайшими кураторскими как active', async () => {
    activeCount = 2;
    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(body.curatedTopUp.error).toBeNull();
    expect(body.curatedTopUp.inserted).toBe(2);
    expect(body.curatedTopUp.activeCount).toBe(4);
    expect(insertedRows).toHaveLength(2);
    for (const row of insertedRows) {
      expect(row.status).toBe('active');
      expect(row.source).toBe('curated');
      expect(String(row.link)).toMatch(/^https:\/\//);
    }
    // Добираются самые ближайшие: Open Coffee Fest (2026-12-05), затем ОГОНЁК.
    expect(insertedRows[0].title).toBe('Open Coffee Fest');
    expect(insertedRows[1].title).toBe('Фестиваль «ОГОНЁК»');
  });

  it('top-up: минимум уже набран → ничего не вставляет', async () => {
    activeCount = 5;
    const { POST } = await import('./route');
    const response = await POST(cronRequest());
    const body = await response.json();

    expect(body.curatedTopUp.inserted).toBe(0);
    expect(body.curatedTopUp.activeCount).toBe(5);
    expect(insertedRows).toHaveLength(0);
  });

  it('без секрета крона — 401, ничего не трогает', async () => {
    process.env.EVENTS_CRON_SECRET = '';
    const { POST } = await import('./route');
    const response = await POST(cronRequest());

    expect(response.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
    expect(insertedRows).toHaveLength(0);
  });
});
