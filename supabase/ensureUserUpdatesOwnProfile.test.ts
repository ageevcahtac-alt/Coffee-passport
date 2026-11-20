import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ensure-миграция 0048 — write-path мини-профиля гостя (баг пакета №4:
// «профиль стирается после сохранения»). Симптом: форма в /loyalty показывала
// успех, после перезагрузки поля пустые. Механика бага: PostgREST на UPDATE,
// отсечённый RLS-политикой или column-grant'ом, возвращает 200 с пустым телом
// — error=null при нуле затронутых строк, старый клиент рапортовал успех.
// SELECT-политику пересоздавала 0047, write-path — эта миграция. Offline CI
// cannot run Postgres, so like lotActivationGuard / cronRpcGrants this
// replays the migration text and pins its semantics: узкая UPDATE-политика
// (только своя строка), column-grant на ровно четыре self-editable колонки,
// паттерн идемпотентности drop+create (как 0013/0047), и что чужие
// политики (0047 SELECT, 0013 staff-read) не трогаются.
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0048_ensure_user_updates_own_profile.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('ensure user updates own profile (0048)', () => {
  it('пересоздаёт UPDATE-политику на profiles — только своя строка', () => {
    const all = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d{4}_.*\.sql$/.test(file))
      .flatMap((file) => [...readSql(file).matchAll(
        /create\s+policy\s+"user updates own display name"\s+on\s+(?:public\.)?profiles\s+for\s+update/gi
      )]);
    // Два create в истории: заводящий 0012 и ensure-пересоздание 0048 (drop
    // в 0048 перекрывает 0012 на любой базе, включая чистую, где 0012 ещё
    // только создал политику). Других UPDATE-политик на profiles нет.
    expect(all).toHaveLength(2);

    const sql = readSql(MIGRATION);
    // Идемпотентность паттерна 0013/0047: drop if exists строго перед create.
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"user updates own display name"\s+on\s+(?:public\.)?profiles/i);
    expect(sql.indexOf('drop policy')).toBeLessThan(sql.indexOf('create policy'));
    // USING и WITH CHECK — обе стороны узкие: только auth.uid() = id.
    expect(sql).toMatch(/using\s*\(auth\.uid\(\)\s*=\s*id\)/i);
    expect(sql).toMatch(/with\s+check\s*\(auth\.uid\(\)\s*=\s*id\)/i);
  });

  it('фиксирует column-grant на ровно четыре self-editable колонки', () => {
    const sql = readSql(MIGRATION);
    const grant = sql.match(/grant\s+update\s*\(([^)]*)\)\s+on\s+(?:public\.)?profiles\s+to\s+authenticated/i);
    expect(grant).toBeTruthy();
    const columns = grant![1].split(',').map((column) => column.trim()).sort();
    expect(columns).toEqual(['city', 'display_name', 'favorite_drink', 'phone']);
  });

  it('не трогает SELECT-политику 0047, staff-чтение 0013 и таблицу', () => {
    const sql = readSql(MIGRATION);
    expect(sql).not.toMatch(/"user reads own profile"/i);
    expect(sql).not.toMatch(/"staff read enthusiast display names"/i);
    expect(sql).not.toMatch(/enable\s+row\s+level\s+security|force\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/revoke/i);
  });

  it('клиент подтверждает факт записи: updateOwnProfile требует RETURNING-строку', () => {
    // Пиним парный фикс клиента: без .select() молчаливый no-op неотличим
    // от успеха. Регресс в любом направлении ловится здесь или в
    // lib/data/loyalty.test.ts.
    const source = fs.readFileSync(path.resolve(__dirname, '../lib/data/loyalty.ts'), 'utf8');
    expect(source).toMatch(/\.update\(\{[\s\S]*?\}\)\s*\.eq\('id', user\.id\)\s*\.select\('id'\)\s*\.maybeSingle\(\)/);
  });
});
