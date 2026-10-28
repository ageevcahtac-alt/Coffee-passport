#!/usr/bin/env python3
"""Временные учётки для workflow verify-session-state (главная и меню: «вошёл / не вошёл»).

Запускается на сервере. Адрес Supabase и service_role — из /opt/coffee-passport/app/.env.local.
Все учётки прогона — session-state-*@example.com; email и пароли не печатаются.
  purge          — удалить ВСЕ учётки session-state-*@example.com (их оценки — до учётки). Каждая отдельно:
                   ошибка на одной не обрывает остальные. Затем проверка: не осталось ни одной.
  create         — stdin {"<метка>": {email, password, role, cafe_id?}}: подтверждённые учётки с профилем
                   роли (обжарщик — первый slug с «xo», иначе первый); печатает LOT_ID активного лота.
  claimed <lot>  — stdin {"email": …}: сколько оценок у этой учётки в checkins (CLAIMED=N, из них лота <lot>).
"""
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

APP_ENV = Path('/opt/coffee-passport/app/.env.local')
PREFIX, DOMAIN = 'session-state-', '@example.com'


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


def temp_users():
    found, page = [], 1
    while True:
        body = call('GET', f'/auth/v1/admin/users?page={page}&per_page=200')
        users = body.get('users', []) if isinstance(body, dict) else body
        found += [u for u in users if re.fullmatch(re.escape(PREFIX) + r'[a-z0-9-]+' + re.escape(DOMAIN),
                                                   (u.get('email') or '').lower())]
        if len(users) < 200:
            return found
        page += 1


def label(user):
    # Метка без email: роль-часть адреса session-state-<роль>-<run>.
    return (user.get('email') or '').split('@')[0][len(PREFIX):].rsplit('-', 1)[0] or '?'


def purge():
    failed = False
    for user in temp_users():
        try:
            deleted = call('DELETE', f'/rest/v1/checkins?owner_user_id=eq.{user["id"]}', prefer='return=representation')
            call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
            print(f'deleted {label(user)} (checkins={len(deleted or [])})')
        except (SystemExit, Exception) as error:  # HTTP, сеть, таймаут — следующая учётка всё равно удаляется
            print(f'{error} ({label(user)})')
            failed = True
    left = len(temp_users())
    print(f'temp accounts left: {left}')
    if failed or left:
        sys.exit(1)


def roaster_slug():
    slugs = [row['slug'] for row in call('GET', '/rest/v1/roasters?select=slug&order=slug') or []]
    if not slugs:
        sys.exit('FAIL в roasters нет ни одного обжарщика')
    return next((slug for slug in slugs if 'xo' in slug), slugs[0])


def create(accounts):
    # Лот обжарщика XO — его пьют в кофейне shop-xo-vsevolozhsk (как в verify-checkin-delivery).
    roasters = call('GET', f'/rest/v1/roasters?select=id&slug=eq.{roaster_slug()}')
    lots = call('GET', f'/rest/v1/lots?select=public_id&status=eq.active&roaster_id=eq.{roasters[0]["id"]}'
                       '&order=public_id&limit=1')
    if not lots:
        sys.exit('FAIL у обжарщика нет активных лотов')
    print(f'LOT_ID={lots[0]["public_id"]}')
    for name, account in accounts.items():
        if not account['email'].startswith(PREFIX) or not account['email'].endswith(DOMAIN):
            sys.exit(f'FAIL {name}: адрес не session-state-*@example.com')
        user = call('POST', '/auth/v1/admin/users',
                    {'email': account['email'], 'password': account['password'], 'email_confirm': True})
        roaster = roaster_slug() if account['role'] == 'roaster_admin' else None
        profile = {'id': user['id'], 'role': account['role'], 'cafe_id': account.get('cafe_id'),
                   'roaster_id': roaster, 'barista_id': None}
        rows = call('POST', '/rest/v1/profiles?on_conflict=id', profile,
                    prefer='resolution=merge-duplicates,return=representation')
        if not rows or rows[0].get('role') != account['role']:
            sys.exit(f'FAIL {name}: роль не записалась')
        print(f'created {name}: {account["role"]}')


def claimed(lot, account):
    user = next((u for u in temp_users() if u['email'].lower() == account['email'].lower()), None)
    if not user:
        sys.exit('FAIL учётки гостя нет')
    # Учётка новая: любая её оценка — перенесённая с устройства гостя.
    rows = call('GET', f'/rest/v1/checkins?select=lot_id&owner_user_id=eq.{user["id"]}') or []
    print(f'CLAIMED={len(rows)} of_lot={sum(1 for row in rows if row["lot_id"] == lot)}')


if len(sys.argv) < 2:
    sys.exit('usage: purge | create | claimed <lot>')
if sys.argv[1] == 'purge':
    purge()
elif sys.argv[1] == 'create':
    create(json.load(sys.stdin))
elif sys.argv[1] == 'claimed' and len(sys.argv) == 3:
    claimed(sys.argv[2], json.load(sys.stdin))
else:
    sys.exit('usage: purge | create | claimed <lot>')
