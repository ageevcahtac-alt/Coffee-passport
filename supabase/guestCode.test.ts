import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Миграция 0051 — постоянный 5-значный код гостя (человекочитаемый фолбэк
// к QR). Offline CI cannot run Postgres, so like ensureUserUpdatesOwnProfile
// this replays the migration text and pins its semantics: колонка TEXT (не
// число — '00123' валиден), отдельный unique index (NULL'и не конфликтуют —
// staff без кода), генерация в базе (триггер регистрации) с retry на
// коллизию (exception unique_violation → перегенерация), backfill только
// NULL'ов у enthusiast (идемпотентно, не ротирует выданные коды).
// Реальный прогон против Postgres (гонка параллельных регистраций, коллизия,
// ведущие нули, идемпотентность) — workflow migration-test.
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0051_guest_code.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('guest_code (0051)', () => {
  it('колонка TEXT с отдельным unique index — код с ведущими нулями, NULL не конфликтует', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/alter\s+table\s+(?:public\.)?profiles\s+add\s+column\s+if\s+not\s+exists\s+guest_code\s+text/i);
    expect(sql).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+profiles_guest_code_key\s+on\s+(?:public\.)?profiles\s*\(\s*guest_code\s*\)/i);
  });

  it('генерация в триггере регистрации: 5 цифр с lpad, не числовой тип', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+(?:public\.)?handle_new_user_profile\s*\(\s*\)\s*returns\s+trigger/i);
    // lpad(..., 5, '0') — текст фиксированной длины с ведущими нулями.
    expect(sql).toMatch(/lpad\s*\(\s*floor\s*\(\s*random\s*\(\s*\)\s*\*\s*100000\s*\)\s*::\s*integer\s*::\s*text\s*,\s*5\s*,\s*'0'\s*\)/i);
  });

  it('коллизия → перегенерация: exception unique_violation внутри retry-цикла', () => {
    const sql = readSql(MIGRATION);
    // В теле триггера: вложенный begin/exception на unique_violation,
    // попытки ограничены (retry не бесконечный).
    expect(sql).toMatch(/exception\s+when\s+unique_violation\s+then/i);
    expect(sql).toMatch(/v_attempts\s*:=\s*v_attempts\s*\+\s*1\s*;?/i);
    expect(sql).toMatch(/if\s+v_attempts\s*>=\s*100\s+then/i);
    // Гарантия уникальности — индексом базы, а не проверкой приложения:
    // в триггере НЕТ предварительного select exists по коду (он бесполезен
    // в гонке) — конфликт ловится исключением вставки.
    const triggerBody = sql.slice(sql.indexOf('create or replace function'));
    expect(triggerBody).not.toMatch(/select\s+(exists\s+)?.*guest_code.*(exists)?/i);
  });

  it('backfill: только enthusiast без кода, retry на коллизию, без перезаписи выданных', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/for\s+r\s+in\s+select\s+id\s+from\s+(?:public\.)?profiles\s+where\s+guest_code\s+is\s+null\s+and\s+role\s*=\s*'enthusiast'/i);
    const doBlock = sql.slice(sql.indexOf('do $$'));
    expect(doBlock).toMatch(/where\s+guest_code\s+is\s+null/i);
    expect(doBlock).toMatch(/exception\s+when\s+unique_violation\s+then/i);
    // Без ротации: нет update ... set guest_code вне условия «is null»
    // (backfill-цикл выше и есть единственный update, и он идёт по выборке
    // NULL'ов — анти-подделка: в миграции ровно один update profiles).
    const updates = sql.match(/update\s+(?:public\.)?profiles/gi) ?? [];
    expect(updates).toHaveLength(1);
  });

  it('не трогает QR-поток: нет изменений формата токена и политик', () => {
    const sql = readSql(MIGRATION);
    expect(sql).not.toMatch(/coffeepassport-guest/i);
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy/i);
    // staff-строки не получают код: backfill ограничен role='enthusiast',
    // триггер вставляет только новым (enthusiast по умолчанию).
    expect(sql).toMatch(/role\s*=\s*'enthusiast'/i);
  });
});
