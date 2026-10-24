import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0035_checkins_roaster_view_profile_seen.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const normalize = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase();
const view = (sql: string) => {
  const match = sql.match(/create\s+(?:or\s+replace\s+)?view\s+public\.checkins_roaster_view\s+as\s+select\s+([\s\S]*?)\s+from\s+([\s\S]*?);/i);
  expect(match, 'roaster view definition must exist').not.toBeNull();
  return {
    columns: match![1].split(',').map(normalize),
    access: normalize(match![2]),
  };
};

describe('roaster view profile seen before tasting', () => {
  it('has the dedicated migration', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION))).toBe(true);
  });

  it('appends the flag after every existing column in its original order', () => {
    const original = view(readSql('0021_drink_evaluation.sql'));
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/create\s+or\s+replace\s+view\s+public\.checkins_roaster_view\b/i);
    expect(view(sql).columns).toEqual([...original.columns, 'c.profile_seen_before_tasting']);
  });

  it('preserves the original join and access filter', () => {
    expect(view(readSql(MIGRATION)).access)
      .toBe(view(readSql('0021_drink_evaluation.sql')).access);
  });

  it('preserves policies and privileges except for the authenticated select grant', () => {
    const sql = readSql(MIGRATION);
    expect(sql).not.toMatch(/\b(?:drop\s+view|policy|row\s+level\s+security|revoke)\b/i);
    const grants = [...sql.matchAll(/\bgrant\b[^;]*;/gi)].map(([grant]) => normalize(grant));
    expect(grants).toEqual(['grant select on public.checkins_roaster_view to authenticated;']);
  });

  it('reloads the PostgREST schema', () => {
    expect(readSql(MIGRATION)).toMatch(/notify\s+pgrst\s*,\s*'reload schema'\s*;/i);
  });
});
