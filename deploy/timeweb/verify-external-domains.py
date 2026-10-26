#!/usr/bin/env python3
"""Временные учётки кабинетов и сводка исходящих адресов сервера для workflow verify-external-domains.

Запускается на сервере. Адрес Supabase и service_role — из /opt/coffee-passport/app/.env.local.
На stdin — JSON {"<метка>": {email, password, role, cafe_id?, roaster?}}; email и пароли не печатаются.
  create — подтверждённые учётки с профилем нужной роли; обжарщик — первый slug с «xo», иначе первый
  delete — удалить учётки (профили удаляются каскадом); повторный вызов без учёток — ok
  egress — куда сервер ходит сам: хосты из URL в .env.local и Supabase .env, хост SMTP Auth,
           заданы ли ключ Resend и адрес уведомлений. Только имена переменных и хосты — без значений.
"""
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

APP_ENV = Path('/opt/coffee-passport/app/.env.local')
SUPABASE_ENV = Path('/opt/coffee-passport/supabase/.env')


def read_env(path):
    env = {}
    for line in path.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and not key.lstrip().startswith('#'):
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


app = read_env(APP_ENV)
BASE = app['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SERVICE = app['SUPABASE_SERVICE_ROLE_KEY']


def call(method, path, body=None, prefer=None):
    headers = {'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE, 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(BASE + path, data=data, method=method, headers=headers), timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        raise SystemExit(f'FAIL {method} {path.split("?")[0]} -> HTTP {error.code}') from None


def find(email):
    page = 1
    while True:
        body = call('GET', f'/auth/v1/admin/users?page={page}&per_page=200')
        users = body.get('users', []) if isinstance(body, dict) else body
        for user in users:
            if (user.get('email') or '').lower() == email.lower():
                return user
        if len(users) < 200:
            return None
        page += 1


def roaster_slug():
    rows = call('GET', '/rest/v1/roasters?select=slug&order=slug')
    slugs = [row['slug'] for row in rows or []]
    if not slugs:
        sys.exit('FAIL в roasters нет ни одного обжарщика')
    return next((slug for slug in slugs if 'xo' in slug), slugs[0])


def create(accounts):
    for label, account in accounts.items():
        user = call('POST', '/auth/v1/admin/users',
                    {'email': account['email'], 'password': account['password'], 'email_confirm': True})
        roaster = roaster_slug() if account['role'] == 'roaster_admin' else None
        profile = {'id': user['id'], 'role': account['role'], 'cafe_id': account.get('cafe_id'),
                   'roaster_id': roaster, 'barista_id': None}
        rows = call('POST', '/rest/v1/profiles?on_conflict=id', profile,
                    prefer='resolution=merge-duplicates,return=representation')
        if not rows or rows[0].get('role') != account['role']:
            sys.exit(f'FAIL {label}: роль не записалась')
        extra = ' '.join(f'{k}={v}' for k, v in (('cafe_id', profile['cafe_id']), ('roaster_id', roaster)) if v)
        print(f'created {label}: {account["role"]} {extra}'.rstrip())


def delete(accounts):
    # Ошибка на одной учётке не обрывает удаление остальных (ревью Codex): каждая — отдельно.
    failed = False
    for label, account in accounts.items():
        try:
            user = find(account['email'])
            if user:
                call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
                print(f'deleted {label}')
            else:
                print(f'no temp {label}')
            if find(account['email']):
                print(f'FAIL temp {label} still exists')
                failed = True
        except SystemExit as error:
            print(f'{error} ({label})')
            failed = True
    if failed:
        sys.exit(1)


URL = re.compile(r'^[a-z][a-z0-9+.-]*://', re.I)


def egress():
    for title, path in (('app .env.local', APP_ENV), ('supabase .env', SUPABASE_ENV)):
        env = read_env(path)
        print(f'## {title}: хосты в URL-переменных')
        for key in sorted(env):
            if URL.match(env[key]):
                print(f'{key} -> {urlparse(env[key]).hostname}')
        if title == 'supabase .env':
            print(f'SMTP_HOST -> {env.get("SMTP_HOST") or "(не задан)"}')
            print(f'SMTP_PORT -> {env.get("SMTP_PORT") or "(не задан)"}')
            print(f'ENABLE_EMAIL_AUTOCONFIRM -> {env.get("ENABLE_EMAIL_AUTOCONFIRM") or "(не задан)"}')
        else:
            for key in ('RESEND_API_KEY', 'PARTNER_NOTIFY_EMAIL', 'XO_ADMIN_INTEGRATION_SECRET'):
                print(f'{key} -> {"задан" if env.get(key) else "не задан"}')
            sender = env.get('PARTNER_NOTIFY_FROM', '')
            print(f'PARTNER_NOTIFY_FROM домен -> {sender.rpartition("@")[2].rstrip(">") or "(не задан)"}')


if sys.argv[1] == 'egress':
    egress()
    sys.exit(0)
temp = json.load(sys.stdin)
if sys.argv[1] == 'create':
    create(temp)
elif sys.argv[1] == 'delete':
    delete(temp)
else:
    sys.exit('usage: create | delete | egress')
