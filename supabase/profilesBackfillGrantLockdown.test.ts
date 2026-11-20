import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Миграция 0050 — фикс общего корня двух боевых багов (2026-11-20):
// «профиль не сохраняется» (UPDATE 0 строк → честная ошибка) и «Гость не
// найден» по QR. У части auth.users строки profiles не было (аккаунты старше
// триггера 0007). Offline CI cannot run Postgres, so like
// ensureUserUpdatesOwnProfile this replays the migration text and pins its
// semantics: backfill insert ... on conflict do nothing (идемпотентно,
// дефолтная роль enthusiast), детерминированное пересоздание триггера
// (drop if exists + create) и lockdown дрейфующих table-level грантов до
// каноничного набора миграций (SELECT + column-level UPDATE на 4 колонки).
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0050_profiles_backfill_and_grant_lockdown.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('profiles backfill + grant lockdown (0050)', () => {
  it('backfill: insert из auth.users с on conflict do nothing — идемпотентно', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(
      /insert\s+into\s+(?:public\.)?profiles\s*\(\s*id\s*,\s*role\s*,\s*email\s*\)\s*select\s+u\.id\s*,\s*'enthusiast'\s*,\s*u\.email\s+from\s+(?:auth\.)?users\s+u\s+left\s+join\s+(?:public\.)?profiles\s+p\s+on\s+p\.id\s*=\s*u\.id\s+where\s+p\.id\s+is\s+null\s+on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i
    );
    // Досылаем именно НЕхватающие строки (left join + where p.id is null) —
    // анти-подделка: не «insert без where», не «update существующих».
    expect(sql).toMatch(/where\s+p\.id\s+is\s+null/i);
  });

  it('триггер пересоздаётся детерминированно (drop if exists перед create)', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/drop\s+trigger\s+if\s+exists\s+on_auth_user_created_profile\s+on\s+(?:auth\.)?users/i);
    expect(sql).toMatch(/create\s+trigger\s+on_auth_user_created_profile\s+after\s+insert\s+on\s+(?:auth\.)?users\s+for\s+each\s+row\s+execute\s+function\s+(?:public\.)?handle_new_user_profile\s*\(\s*\)/i);
    expect(sql.indexOf('drop trigger')).toBeLessThan(sql.indexOf('create trigger'));
  });

  it('lockdown: table-level INSERT/UPDATE/REFERENCES отзываются у anon/authenticated', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/revoke\s+select\s*,\s*insert\s*,\s*update\s*,\s*references\s+on\s+(?:public\.)?profiles\s+from\s+anon/i);
    expect(sql).toMatch(/revoke\s+insert\s*,\s*update\s*,\s*references\s+on\s+(?:public\.)?profiles\s+from\s+authenticated/i);
  });

  it('каноничный набор: SELECT таблицы + column-level UPDATE ровно на 4 self-editable колонки', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/grant\s+select\s+on\s+(?:public\.)?profiles\s+to\s+authenticated/i);
    expect(sql).toMatch(/grant\s+update\s*\(\s*display_name\s*,\s*phone\s*,\s*city\s*,\s*favorite_drink\s*\)\s+on\s+(?:public\.)?profiles\s+to\s+authenticated/i);
    // После lockdown в файле ровно два grant'а — каноничных; ни одного
    // table-level INSERT/UPDATE/REFERENCES grant'а.
    const tail = sql.slice(sql.indexOf('revoke'));
    const grants = tail.match(/grant\s+[^;]+;/gi) ?? [];
    expect(grants).toHaveLength(2);
    for (const grant of grants) {
      expect(grant).not.toMatch(/grant\s+(insert|references)\b/i);
      expect(grant).not.toMatch(/grant\s+update\s+on/i);
    }
  });

  it('история миграций: не создаёт политик и не трогает данные кроме backfill', () => {
    const sql = readSql(MIGRATION);
    // Политики 0047/0048 создаются только в своих миграциях — тут без
    // drop/create policy, без alter table, без delete/truncate.
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/\bdelete\b|\btruncate\b/i);
  });
});
