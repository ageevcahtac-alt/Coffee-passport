import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Lot activation guard (0037, grain-flow audit F-5/P-5): the readiness rule
// that used to live only in the browser (CanonicalLotStatusControl's
// isReadyForActive — name + qGrade > 0) must be enforced server-side so a
// direct PostgREST PATCH of lots.status cannot activate a not-ready Lot.
// Offline CI cannot run Postgres, so like cronRpcGrants/checkinsProfileSeen
// this replays the migration text and pins its semantics: right table, right
// timing (BEFORE UPDATE), transition-INTO-active-only, both readiness
// conditions, a raise (not a silent fix) — and that no RLS/privilege is
// touched (RLS must not be weakened or widened by this guard).
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION = '0037_lot_activation_guard.sql';
const readSql = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('lot activation guard', () => {
  it('creates exactly one BEFORE INSERT OR UPDATE trigger on lots', () => {
    const created = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d{4}_.*\.sql$/.test(file))
      .flatMap((file) => [...readSql(file).matchAll(
        /create\s+trigger\s+(?:public\.)?trg_lots_activation_guard\s+before\s+(insert\s+or\s+)?update\s+on\s+(?:public\.)?lots\b/gi
      )]);
    expect(created).toHaveLength(1);
    // The INSERT arm must be there — an UPDATE-only guard is bypassed by
    // INSERTing a row that is already 'active' (Codex review, round 1).
    expect(created[0][1]).toBeTruthy();
  });

  it('guard fires only on becoming active and raises', () => {
    const sql = readSql(MIGRATION);
    // Becoming 'active': on INSERT at all, on UPDATE only as a transition.
    expect(sql).toMatch(/new\.status\s*=\s*'active'/i);
    expect(sql).toMatch(/tg_op\s*=\s*'INSERT'/i);
    expect(sql).toMatch(/old\.status\s+is\s+distinct\s+from\s+'active'/i);
    // Both readiness conditions on the NEW row.
    expect(sql).toMatch(/btrim\(new\.name\)\s*=\s*''/i);
    expect(sql).toMatch(/new\.q_grade\s+is\s+null/i);
    expect(sql).toMatch(/new\.q_grade\s*<=\s*0/i);
    // Refuses loudly instead of silently fixing or skipping the write.
    expect(sql).toMatch(/raise\s+exception/i);
    expect(sql).not.toMatch(/return\s+null\s*;/i);
  });

  it('does not touch RLS policies, grants or the table shape', () => {
    expect(readSql(MIGRATION)).not.toMatch(
      /\b(?:(?:create|drop|alter)\s+policy|grant|revoke|(?:enable|disable|force|no\s+force)\s+row\s+level\s+security|alter\s+table\s+public\.lots)\b/i
    );
  });
});
