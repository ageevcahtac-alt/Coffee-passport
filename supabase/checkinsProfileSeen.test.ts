import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0034_checkins_profile_seen_before_tasting.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('checkins profile seen before tasting', () => {
  it('adds the boolean column exactly once with a safe default', () => {
    const sql = readSql(MIGRATION); // Missing 0034 must fail, even if another file adds the column.
    const additions = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d{4}_.*\.sql$/.test(file))
      .flatMap((file) => [...readSql(file).matchAll(
        /alter\s+table\s+(?:"?public"?\.)?"?checkins"?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?profile_seen_before_tasting\b([^;]*);/gi
      )]);
    expect(additions).toHaveLength(1);
    expect(additions[0][1].trim()).toMatch(/^boolean\s+not\s+null\s+default\s+false$/i);
    expect(sql).toMatch(/alter\s+table\s+public\.checkins\s+add\s+column\s+if\s+not\s+exists\s+profile_seen_before_tasting\b/i);
  });

  it('leaves cabinet policies, views and privileges unchanged', () => {
    expect(readSql(MIGRATION)).not.toMatch(/\b(?:(?:create|drop|alter)\s+policy|create\s+(?:or\s+replace\s+)?view|(?:drop|alter)\s+view|(?:enable|disable|force|no\s+force)\s+row\s+level\s+security|grant|revoke)\b/i);
  });

  it('reloads the PostgREST schema', () => {
    expect(readSql(MIGRATION)).toMatch(/notify\s+pgrst\s*,\s*'reload schema'\s*;/i);
  });
});
