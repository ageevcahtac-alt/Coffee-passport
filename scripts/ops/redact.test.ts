import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs без типов
import { redact } from './redact.mjs';

describe('redact', () => {
  it.each([
    ['password: fake-password', 'fake-password'],
    ['password=fake-password', 'fake-password'],
    ['https://user:fake-password@db.invalid/', 'fake-password'],
    ['{"apikey":"fake-api-key-123"}', 'fake-api-key-123'],
    ['SUPABASE_SERVICE_ROLE_KEY=fake-service-role', 'fake-service-role'],
    ['XO_STORE_SECRET: fake-xo-secret', 'fake-xo-secret'],
    ['Authorization: Bearer fake-bearer-token-123', 'fake-bearer-token-123'],
    ['key eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fakesignature', 'eyJyb2xlIjoiYW5vbiJ9'],
    ['GET /api/x?token=fake-query-token&a=1', 'fake-query-token'],
  ])('masks %s', (line, secret) => {
    const out = redact(line);
    expect(out).not.toContain(secret);
    expect(out).toContain('***');
  });

  it.each([
    ['password: fake-password', 'password: ***'],
    ['{"apikey": "fake-key"}', '{"apikey": "***"}'],
    ['postgres://u:fake@db:5432/x', 'postgres://***:***@db:5432/x'],
  ])('exact output for %s', (line, want) => {
    expect(redact(line)).toBe(want);
  });

  it('keeps ordinary lines intact', () => {
    const line = 'Oct 24 10:00:01 coffee-passport[123]: ✓ Ready in 812ms, GET /api/health 200';
    expect(redact(line)).toBe(line);
  });
});
