#!/usr/bin/env python3
"""Почта через Yandex Cloud Postbox на сервере — для workflow postbox.

На stdin — JSON {key_id, secret, notify_email, domain, run}. Секреты, email и пароли не печатаются.
  install      — проверить вход в SMTP Postbox, затем записать ключ в .env.local приложения
                 (POSTBOX_*, PARTNER_NOTIFY_*; RESEND_API_KEY убрать) и SMTP_* в .env Supabase,
                 пересоздать auth, перезапустить приложение. Бэкап обоих файлов — до правки.
  test-partner — тестовая заявка через публичный /api/partner-requests → строка журнала приложения
                 с id письма Postbox → заявка удалена (проверка, что её больше нет)
  test-auth    — временная учётка → /auth/v1/recover (Supabase Auth шлёт письмо через SMTP Postbox)
                 → учётка удалена; плюс прямое SMTP-письмо тем же логином — ответ Postbox с id
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import shutil
import smtplib
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

APP_ENV = Path('/opt/coffee-passport/app/.env.local')
SUPABASE_DIR = Path('/opt/coffee-passport/supabase')
SUPABASE_ENV = SUPABASE_DIR / '.env'
SITE = 'https://coffeepassport.ru'
SMTP_HOST = 'postbox.cloud.yandex.net'
SMTP_PORT = 587


def read_env(path):
    env = {}
    for line in path.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and not key.lstrip().startswith('#'):
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def write_env(path, updates, remove=()):
    """Меняет/добавляет ключи, удаляет remove; порядок и комментарии остальных строк сохраняются."""
    lines, seen = [], set()
    for line in path.read_text().splitlines():
        key = line.partition('=')[0].strip()
        if '=' in line and not key.startswith('#'):
            if key in remove:
                continue
            if key in updates:
                lines.append(f'{key}={updates[key]}')
                seen.add(key)
                continue
        lines.append(line)
    lines += [f'{key}={value}' for key, value in updates.items() if key not in seen]
    mode = path.stat().st_mode & 0o777
    path.write_text('\n'.join(lines) + '\n')
    path.chmod(mode)


def smtp_password(secret):
    """Пароль SMTP из секрета статического ключа — generate.py из документации Postbox (send-email)."""
    def sign(key, msg):
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()
    signature = sign(('AWS4' + secret).encode(), '20230926')
    for part in ('ru-central1', 'postbox', 'aws4_request', 'SendRawEmail'):
        signature = sign(signature, part)
    return base64.b64encode(bytes([0x04]) + signature).decode()


def smtp_login(key_id, password):
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(key_id, password)


def smtp_send(key_id, password, sender, to, subject, text):
    """Письмо по SMTP; возвращает ответ сервера на DATA (Postbox отдаёт в нём id письма)."""
    body = (f'From: Coffee Passport <{sender}>\r\nTo: {to}\r\nSubject: {subject}\r\n'
            'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + text)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(key_id, password)
        smtp.mail(sender)
        code, reply = smtp.rcpt(to)
        if code >= 300:
            raise SystemExit(f'FAIL SMTP RCPT {code}')
        code, reply = smtp.data(body.encode())
        return code, reply.decode(errors='replace')


def compose(*args):
    return subprocess.run(['docker', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml', *args],
                          cwd=SUPABASE_DIR, check=True, capture_output=True, text=True).stdout


def wait_health():
    for _ in range(30):
        try:
            with urlopen(SITE + '/api/health', timeout=15) as response:
                if b'"status":"ok"' in response.read():
                    print('app /api/health ok')
                    return
        except Exception:  # рестарт: первые секунды 502/503 — ждём дальше
            pass
        time.sleep(10)
    raise SystemExit('FAIL app /api/health не ok за 5 минут')


def install(data):
    password = smtp_password(data['secret'])
    smtp_login(data['key_id'], password)
    print(f'SMTP login {SMTP_HOST}:{SMTP_PORT} ok')

    backup = Path('/opt/coffee-passport/backups') / ('postbox-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700, parents=True)
    shutil.copy2(APP_ENV, backup / 'app.env.local')
    shutil.copy2(SUPABASE_ENV, backup / 'supabase.env')
    print(f'BACKUP={backup}')

    sender = f'noreply@{data["domain"]}'
    write_env(APP_ENV, {
        'POSTBOX_ACCESS_KEY_ID': data['key_id'],
        'POSTBOX_SECRET_ACCESS_KEY': data['secret'],
        'PARTNER_NOTIFY_EMAIL': data['notify_email'],
        'PARTNER_NOTIFY_FROM': f'"Coffee Passport <{sender}>"',
    }, remove=('RESEND_API_KEY',))
    print('app .env.local: POSTBOX_ACCESS_KEY_ID, POSTBOX_SECRET_ACCESS_KEY, PARTNER_NOTIFY_EMAIL, PARTNER_NOTIFY_FROM заданы; RESEND_API_KEY убран')

    write_env(SUPABASE_ENV, {
        'SMTP_HOST': SMTP_HOST,
        'SMTP_PORT': str(SMTP_PORT),
        'SMTP_USER': data['key_id'],
        'SMTP_PASS': password,
        'SMTP_ADMIN_EMAIL': sender,
        'SMTP_SENDER_NAME': '"Coffee Passport"',
    })
    print(f'supabase .env: SMTP_HOST={SMTP_HOST} SMTP_PORT={SMTP_PORT} SMTP_ADMIN_EMAIL домен {data["domain"]}; SMTP_USER, SMTP_PASS заданы')

    compose('up', '-d', '--no-deps', 'auth')
    for _ in range(30):
        state = subprocess.run(['docker', 'inspect', '-f', '{{.State.Health.Status}}', 'supabase-auth'],
                               capture_output=True, text=True).stdout.strip()
        if state == 'healthy':
            break
        time.sleep(5)
    print(f'supabase-auth: {state}')
    env = subprocess.run(['docker', 'exec', 'supabase-auth', 'printenv', 'GOTRUE_SMTP_HOST', 'GOTRUE_SMTP_PORT'],
                         capture_output=True, text=True).stdout.split()
    print(f'supabase-auth GOTRUE_SMTP_HOST/PORT: {" ".join(env)}')
    if env[:1] != [SMTP_HOST]:
        raise SystemExit('FAIL auth не видит SMTP Postbox')

    subprocess.run(['systemctl', 'restart', 'coffee-passport'], check=True)
    wait_health()


def supabase_call(method, path, body=None, key=None):
    app = read_env(APP_ENV)
    token = key or app['SUPABASE_SERVICE_ROLE_KEY']
    headers = {'apikey': token, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    data = None if body is None else json.dumps(body).encode()
    url = app['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/') + path
    try:
        with urlopen(Request(url, data=data, method=method, headers=headers), timeout=30) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else None)
    except HTTPError as error:
        return error.code, error.read().decode(errors='replace')[:300]


def journal_since(since, unit_grep):
    out = subprocess.run(['journalctl', '-u', 'coffee-passport', '--since', since, '--no-pager', '-o', 'cat'],
                         capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if unit_grep in line]


def test_partner(data):
    company = f'POSTBOX TEST {data["run"]}'
    since = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    payload = {'company_name': company, 'contact_name': 'Автотест Postbox', 'role_requested': 'coffee_shop',
               'email': f'postbox-test-{data["run"]}@example.com', 'comment': 'автотест workflow postbox, удаляется'}
    request = Request(SITE + '/api/partner-requests', data=json.dumps(payload).encode(), method='POST',
                      headers={'Content-Type': 'application/json'})
    failed = False
    try:
        with urlopen(request, timeout=30) as response:
            print(f'POST /api/partner-requests -> HTTP {response.status} {response.read().decode()}')
        time.sleep(5)
        lines = journal_since(since, '[partner-requests]')
        for line in lines:
            print('journal:', line)
        if not any('Postbox accepted' in line for line in lines):
            print('FAIL нет строки «Postbox accepted» в журнале приложения')
            failed = True
    finally:
        status, _ = supabase_call('DELETE', '/rest/v1/partner_requests?company_name=eq.' + quote(company))
        print(f'cleanup DELETE partner_requests -> HTTP {status}')
        status, rows = supabase_call('GET', '/rest/v1/partner_requests?select=id&company_name=eq.' + quote(company))
        left = len(rows) if isinstance(rows, list) else '?'
        print(f'cleanup: тестовых заявок осталось {left}')
        if left != 0:
            failed = True
    if failed:
        sys.exit(1)


def test_auth(data):
    email = f'postbox-auth-{data["run"]}@example.com'
    app = read_env(APP_ENV)
    sb = read_env(SUPABASE_ENV)
    since = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    failed = False
    status, user = supabase_call('POST', '/auth/v1/admin/users',
                                 {'email': email, 'password': 'Pb' + secrets.token_hex(12) + '!a', 'email_confirm': True})
    print(f'temp user -> HTTP {status}')
    if status >= 300:
        sys.exit(1)
    try:
        status, body = supabase_call('POST', '/auth/v1/recover', {'email': email},
                                     key=app['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
        print(f'POST /auth/v1/recover -> HTTP {status} {body if status >= 300 else ""}'.rstrip())
        failed = status >= 300
        time.sleep(3)
        logs = compose('logs', '--no-color', '--since', since, 'auth')
        for line in logs.splitlines():
            if any(word in line.lower() for word in ('mail', 'smtp', 'recover', '"level":"error"')):
                print('auth log:', line[:400])
        code, reply = smtp_send(sb['SMTP_USER'], sb['SMTP_PASS'], sb['SMTP_ADMIN_EMAIL'], email,
                                'Coffee Passport: проверка SMTP Postbox', 'Автотест workflow postbox.')
        print(f'SMTP DATA (тот же логин, что у Supabase Auth) -> {code} {reply}')
        failed = failed or code != 250
    finally:
        uid = user.get('id') if isinstance(user, dict) else None
        status, _ = supabase_call('DELETE', f'/auth/v1/admin/users/{uid}')
        print(f'cleanup DELETE temp user -> HTTP {status}')
        status, _ = supabase_call('GET', f'/auth/v1/admin/users/{uid}')
        print(f'cleanup: GET temp user -> HTTP {status} (404 = удалена)')
        failed = failed or status != 404
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    handlers = {'install': install, 'test-partner': test_partner, 'test-auth': test_auth}
    if mode not in handlers:
        sys.exit('usage: install | test-partner | test-auth')
    os.umask(0o077)
    handlers[mode](json.load(sys.stdin))
