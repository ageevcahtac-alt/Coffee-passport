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
  it('creates exactly one BEFORE UPDATE trigger on lots', () => {
    const created = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d{4}_.*\.sql$/.test(file))
      .flatMap((file) => [...readSql(file).matchAll(
        /create\s+trigger\s+(?:public\.)?trg_lots_activation_guard\s+(\w+)\s+update\s+on\s+(?:public\.)?lots\b/gi
      )]);
    expect(created).toHaveLength(1);
    expect(created[0][1].toLowerCase()).toBe('before');
  });

  it('guard fires only on the transition INTO active and raises', () => {
    const sql = readSql(MIGRATION);
    // Transition-into-active only (an already-active Lot stays editable).
    expect(sql).toMatch(/new\.status\s*=\s*'active'/i);
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
