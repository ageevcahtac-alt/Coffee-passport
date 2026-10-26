import { describe, expect, it } from 'vitest';
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
    // ревью Codex, раунд 2: значение не обрывается на пробеле, `;` и `,`
    ['Cookie: session=fake-session; other=fake-other', 'Cookie: ***'],
    ['password: fake password with spaces', 'password: ***'],
    ['{"access_token":"fake,secret","user":"u1"}', '{"access_token":"***","user":"u1"}'],
    ['{"token":"fake\\"quoted"}', '{"token":"***"}'],
    ['GET /api/x?token=fake-query-token&a=1 200', 'GET /api/x?token=***&a=1 200'],
  ])('exact output for %s', (line, want) => {
    expect(redact(line)).toBe(want);
  });

  // Персональные данные: email и телефоны не уходят в логи GitHub Actions (серверы в США).
  it.each([
    ['login failed for fake.user+tag@mail-test.ru', 'fake.user+tag@mail-test.ru'],
    ['{"email":"Fake.User@Example.COM","role":"cafe_admin"}', 'Fake.User@Example.COM'],
    ['GET /auth/login?email=fake%40mail.ru 200', 'fake%40mail.ru'],
    ['контакт: иван@почта.рф', 'иван@почта.рф'],
    ['phone +7 (912) 345-67-89', '345-67-89'],
    ['phone +79123456789', '9123456789'],
    ['phone +7 912 345 67 89', '345 67 89'],
    ['тел. 8 (912) 345-67-89', '345-67-89'],
    ['тел. 89123456789', '9123456789'],
    ['тел. 8-912-345-67-89', '345-67-89'],
    ['{"phone":"79123456789"}', '9123456789'],
    // ревью Codex, раунд 1: url-кодированные и с точками
    ['GET /x?phone=%2B79123456789', '9123456789'],
    ['GET /x?phone=+7+912+345+67+89', '345+67+89'],
    ['GET /x?phone=8%20912%20345%2067%2089', '345%2067%2089'],
    ['phone +7.912.345.67.89', '345.67.89'],
    // ревью Codex, раунд 2: исключение systemd не открывает настоящие адреса
    ['email=fake@example.target', 'fake@example.target'],
    ['GET /x?email=fake%40example.target', 'fake%40example.target'],
    ['GET /x?email=fake%40example.service', 'fake%40example.service'],
  ])('masks personal data in %s', (line, pd) => {
    const out = redact(line);
    expect(out).not.toContain(pd);
    expect(out).toContain('***');
  });

  it.each([
    ['login failed for fake@mail.ru', 'login failed for ***@***'],
    ['{"email":"fake@mail.ru","role":"admin"}', '{"email":"***@***","role":"admin"}'],
    ['GET /x?email=fake%40mail.ru&a=1', 'GET /x?email=***@***&a=1'],
    ['phone +7 (912) 345-67-89, ok', 'phone +7***, ok'],
    ['тел. 89123456789.', 'тел. +7***.'],
  ])('exact personal-data output for %s', (line, want) => {
    expect(redact(line)).toBe(want);
  });

  it.each([
    'Oct 24 10:00:01 coffee-passport[123]: ✓ Ready in 812ms, GET /api/health 200',
    'GET /passport/8f1c2e10-8123-4567-8912-812345678901 200 in 812ms',
    'ts=1729764000123 pid=81234 port=8080 bytes=89123456789012',
    'LISTEN 0 511 0.0.0.0:443 users:(("nginx",pid=812,fd=6))',
    'postgres://***:***@db:5432/x',
    'image node@22 and pkg @supabase/ssr@0.5.2',
    '89123456789abcdef0123456789abcdef0123456',
    // df на сервере: systemd-юниты с @ — не email
    'none 1.0M 0 1.0M 0% /run/credentials/serial-getty@ttyS0.service',
    'Started getty@tty1.service and user-runtime-dir@1000.service',
  ])('keeps non-personal line intact: %s', (line) => {
    expect(redact(line)).toBe(line);
  });
});
