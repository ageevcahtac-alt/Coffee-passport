import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE = path.resolve(__dirname, 'migrations', '0036_partner_directory.sql');
const sql = () => fs.readFileSync(FILE, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('0036_partner_directory', () => {
  it('exists', () => {
    expect(fs.existsSync(FILE)).toBe(true);
  });

  it('adds status, pin colour and the request link to both partner tables', () => {
    const text = sql();
    for (const column of ['status', 'brand_color', 'lat', 'lng', 'photos', 'partner_request_id']) {
      expect(text).toMatch(new RegExp(`alter table public\\.coffee_shops[^;]*add column if not exists ${column}\\b`));
    }
    for (const column of ['status', 'color', 'philosophy', 'partner_request_id']) {
      expect(text).toMatch(new RegExp(`alter table public\\.roasters[^;]*add column if not exists ${column}\\b`));
    }
  });

  it('only lets #rrggbb colours and known statuses into the database (the pin colour goes into HTML)', () => {
    const text = sql();
    expect(text).toMatch(/check \(brand_color is null or brand_color ~ '\^#\[0-9a-fa-f\]\{6\}\$'\)/);
    expect(text).toMatch(/check \(color is null or color ~ '\^#\[0-9a-fa-f\]\{6\}\$'\)/);
    expect(text.match(/check \(status in \('active', 'paused'\)\)/g)).toHaveLength(2);
  });

  it('moves every write to the server: staff update policies dropped, writes revoked from anon and authenticated', () => {
    const text = sql();
    expect(text).toContain('drop policy if exists "cafe staff manage own shop row" on public.coffee_shops;');
    expect(text).toContain('drop policy if exists "roaster staff manage own roaster row" on public.roasters;');
    expect(text).toContain('revoke insert, update, delete on public.coffee_shops, public.roasters from anon, authenticated;');
    expect(text).not.toMatch(/grant (insert|update|delete|all)/);
    expect(text).not.toMatch(/create policy/);
  });
});
