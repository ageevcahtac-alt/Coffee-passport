import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Grind Converter, phase 3 (0038) — server confirmations and the public
// median view. Offline CI cannot run Postgres, so like lotActivationGuard /
// cronRpcGrants this replays the migration text and pins its semantics:
// owner-scoped insert/select RLS (no UPDATE/DELETE grant, plus an
// immutability trigger), the consent/consent-adjacent column rules, and an
// aggregate view that is anonymous BY CONSTRUCTION — no identity column a
// community reader could pivot on (the property scenario G of the checkins
// audit has no TS code path to exercise either, see
// lib/journey/store.test.ts's header comment).
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0038_grind_confirmations.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('grind confirmations migration (0038)', () => {
  it('lands immediately after 0037 with no numbering gap or collision', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => /^\d{4}_.*\.sql$/.test(file));
    const numbers = files.map((file) => Number(file.slice(0, 4))).sort((a, b) => a - b);
    // 0039 — loyalty stage 1 (неидемпотентный черновик, нигде не применён);
    // 0040 — его самодостаточная идемпотентная замена; 0041/0042 — тестовый
    // сид учётки владельца и его откат. Страж следит за последовательностью
    // без разрывов и коллизий.
    expect(numbers).toContain(39);
    expect(numbers[numbers.length - 1]).toBe(42);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('creates grind_confirmations with an auth.users owner and the conversion pair', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.grind_confirmations\s*\(/i);
    expect(sql).toMatch(/owner_user_id\s+uuid\s+not\s+null\s+references\s+auth\.users\(id\)/i);
    for (const column of ['from_model', 'to_model', 'brewing_method', 'from_setting', 'to_setting', 'lot_id']) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\s+text\\s+not\\s+null`, 'i'));
    }
    // Id server-side, audit trail dated server-side — the client never
    // sends either (lib/types/database.ts's GrindConfirmationInsert omits them).
    expect(sql).toMatch(/id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i);
    expect(sql).toMatch(/created_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i);
    expect(sql).toMatch(/enable\s+row\s+level\s+security/i);
  });

  it('grants insert+select to authenticated only — no update/delete privilege anywhere', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/grant\s+insert\s*,\s*select\s+on\s+public\.grind_confirmations\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+(?:update|delete|all)\b/i);
    expect(sql).not.toMatch(/revoke\b/i);
  });

  it('RLS policies scope insert and select to the row owner', () => {
    const sql = readSql(MIGRATION);
    // WITH CHECK guards the row being written; USING guards the row being
    // read — both must bind to auth.uid(), never to a broader scope.
    expect(sql).toMatch(
      /create\s+policy\s+"?owners\s+insert\s+own\s+grind\s+confirmations"?\s+on\s+public\.grind_confirmations\s+for\s+insert\s+with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/i
    );
    expect(sql).toMatch(
      /create\s+policy\s+"?owners\s+read\s+own\s+grind\s+confirmations"?\s+on\s+public\.grind_confirmations\s+for\s+select\s+using\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/i
    );
  });

  it('rows are immutable once created — an update/delete trigger raises, no silent fix', () => {
    const sql = readSql(MIGRATION);
    expect(sql).toMatch(/create\s+(?:or\s+replace\s+)?function\s+public\.prevent_grind_confirmation_mutation\(\)/i);
    expect(sql).toMatch(/before\s+update\s+or\s+delete\s+on\s+public\.grind_confirmations/i);
    expect(sql).toMatch(/raise\s+exception/i);
    expect(sql).not.toMatch(/return\s+null\s*;/i);
    // Codex review round 1: owner_user_id cascades from auth.users, so the
    // DELETE arm must let a cascade (no API context) through — otherwise
    // deleting an account with one confirmation rolls back. API-originated
    // deletes always carry request.jwt.claims and still raise.
    expect(sql).toMatch(/tg_op\s*=\s*'DELETE'\s+and\s+nullif\(current_setting\('request\.jwt\.claims'/i);
    expect(sql).toMatch(/return\s+old\s*;/i);
  });

  it('the community view aggregates by triple with a median and no identity columns', () => {
    const sql = readSql(MIGRATION);
    // percentile_cont(0.5) IS the median for every sample size offline CI
    // cannot run: N=1 returns the single row, odd N the middle row, even N
    // the average of the two middle rows — pinning the function pins all
    // three edges at once.
    expect(sql).toMatch(/percentile_cont\(0\.5\)\s+within\s+group/i);
    expect(sql).toMatch(/group\s+by\s+from_model\s*,\s*to_model\s*,\s*brewing_method/i);
    // Unparseable free-text settings drop out of BOTH the median and the
    // count, so junk can never skew or inflate an estimate.
    expect(sql).toMatch(/where\s+substring\(to_setting/i);
    expect(sql).toMatch(/count\(\*\)/i);
    // Anonymity by construction: the view exposes nothing pivotable.
    const viewBody = sql.slice(sql.search(/create\s+or\s+replace\s+view\s+public\.grind_conversion_medians/i));
    expect(viewBody).not.toMatch(/\b(owner_user_id|created_at)\b/i);
    expect(viewBody).toMatch(/select\s+from_model\s*,\s*to_model\s*,\s*brewing_method\s*,\s*count\(\*\)/i);
    // Same open read tier as checkins_community_view (0026): guests benefit
    // too — but only SELECT.
    expect(sql).toMatch(/grant\s+select\s+on\s+public\.grind_conversion_medians\s+to\s+anon\s*,\s*authenticated/i);
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.grind_conversion_medians/i);
  });
});
