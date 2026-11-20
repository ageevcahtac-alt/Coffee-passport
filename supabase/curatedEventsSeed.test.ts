import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURATED_EVENTS, MIN_ACTIVE_EVENTS } from '../lib/events/curatedEvents';

// Кураторская лента афиши (миграция 0049 + lib/events/curatedEvents.ts,
// пакет №4). Offline CI cannot run Postgres, so like lotActivationGuard /
// cronRpcGrants this replays the migration text and pins its semantics:
// две неверные сидовые строки исправляются в значения ленты (Write-path
// крона дедупит по (title, start_date) — рассинхрон сида и каталога дал бы
// дубли на витрине), INSERT идемпотентен (on conflict do nothing), у каждого
// события непустая https-ссылка, и лента сама по себе набирает минимум
// витрины, пока её даты в будущем.
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0049_curated_events_seed.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('curated events seed (0049)', () => {
  it('исправляет обе неверные сидовые строки и только их', () => {
    const sql = readSql(MIGRATION);
    const updates = sql.match(/update\s+public\.events/g) ?? [];
    // По две ветки на строку: (a) ключ свободен → перезапись, (b) занят →
    // архивация дубля (Codex review round 1, finding 4).
    expect(updates).toHaveLength(4);
    // Coffee Fest (Севкабель, 21–22 ноября 2026) → Open Coffee Fest.
    expect(sql).toMatch(/where\s+title\s*=\s*'Coffee Fest'\s+and\s+start_date\s*=\s*'2026-11-21'/i);
    // «World of Coffee Милан» → Дубай.
    expect(sql).toMatch(/where\s+title\s*=\s*'World of Coffee'\s+and\s+start_date\s*=\s*'2027-02-19'/i);
    // Конфликт-безопасность: каждая перезапись защищена not exists на целевой
    // ключ, каждая архивация — exists + статус.
    expect(sql).toMatch(/not\s+exists\s*\(\s*select\s+1\s+from\s+public\.events\s+where\s+title\s*=\s*'Open Coffee Fest'/i);
    expect(sql).toMatch(/not\s+exists\s*\(\s*select\s+1\s+from\s+public\.events\s+where\s+title\s*=\s*'World of Coffee Дубай'/i);
    expect((sql.match(/status\s*<>\s*'archived'/g) ?? []).length).toBe(2);
    // UPDATE'ы не переписывают чужие строки: ни одного UPDATE без where.
    expect(sql).not.toMatch(/update\s+public\.events\s+set(?:(?!where)[\s\S])*?;/i);
  });

  it('идемпотентна: повторный прогон — тот же результат', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/on\s+conflict\s*\(title,\s*start_date\)\s*do\s+nothing/i);
    // UPDATE привязан к старым сидовым значениям: после первого прогона
    // where-блоки ни одну строку не находят — no-op.
    expect(sql).toContain("start_date = '2026-11-21'");
    expect(sql).toContain("start_date = '2027-02-19'");
    // В ленте нет прошедших на момент написания событий (защита от мёртвого
    // груза — крон их архивирует, но каталог должен быть чистым).
    for (const event of CURATED_EVENTS) {
      expect(event.endDate >= '2026-11-20').toBe(true);
    }
  });

  it('каждое событие ленты — с непустой https-ссылкой (мёртвых ссылок нет)', () => {
    expect(CURATED_EVENTS.length).toBeGreaterThanOrEqual(MIN_ACTIVE_EVENTS);
    for (const event of CURATED_EVENTS) {
      expect(event.link).toMatch(/^https:\/\//);
      expect(event.link.length).toBeGreaterThan('https://'.length);
      expect(event.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(event.endDate >= event.startDate).toBe(true);
    }
    // Тот же пин против заглушек в самой миграции.
    const sql = readSql(MIGRATION);
    for (const match of sql.matchAll(/'((?:https?:)?\/\/[^']*)'/g)) {
      expect(match[1]).toMatch(/^https:\/\//);
    }
  });

  it('каталог (TS) и сид (SQL) — одинаковый набор (title, start_date): drift = красный', () => {
    const sql = readSql(MIGRATION);
    // Каждое событие каталога присутствует в миграции либо как INSERT, либо
    // как целевое значение UPDATE (первые два — именно UPDATE'ы).
    for (const event of CURATED_EVENTS) {
      const inInsert = sql.includes(`'${event.title}'`) && sql.includes(`'${event.startDate}'`);
      expect(inInsert).toBe(true);
    }
    // И наоборот: в миграции не вставляется ничего, чего нет в каталоге
    // (парсим кортежи VALUES: 'Заголовок', 'локация',).
    const insertBlock = sql.slice(sql.indexOf('insert into public.events'));
    const titles = [...insertBlock.matchAll(/^\s*'([^']+)',\s*'[^']*',\s*$/gm)].map((m) => m[1]);
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(CURATED_EVENTS.some((event) => event.title === title)).toBe(true);
    }
  });
});
