import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Replays every grant/revoke on the cron RPCs across supabase/migrations in
// file order and checks the end state. These functions are security definer
// and mutate rows; the cron secret (lib/events/cronAuth.ts) only guards the
// /api/cron/* routes, so any role that can EXECUTE them can bypass it via
// /supabase/rest/v1/rpc/*. Only service_role (createAdminSupabaseClient) may.
// See 0033_cron_rpc_service_role_only.sql.
const CRON_RPCS = ['events_archive_expired', 'events_ingest_candidate', 'cafe_menu_expire_discontinuing'];
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

function finalExecuteGrants(fn: string): Set<string> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  const statement = new RegExp(
    `(grant|revoke)\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+(to|from)\\s+([^;]+);`,
    'gi'
  );
  // Postgres grants EXECUTE to PUBLIC on every new function by default.
  const roles = new Set<string>(['public']);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/--.*$/gm, '');
    for (const match of sql.matchAll(statement)) {
      const targets = match[3].split(',').map((r) => r.trim().toLowerCase());
      for (const role of targets) {
        if (match[1].toLowerCase() === 'grant') roles.add(role);
        else roles.delete(role);
      }
    }
  }
  return roles;
}

describe('cron RPC execute grants', () => {
  it.each(CRON_RPCS)('%s is executable by service_role only', (fn) => {
    expect([...finalExecuteGrants(fn)].sort()).toEqual(['service_role']);
  });
});
