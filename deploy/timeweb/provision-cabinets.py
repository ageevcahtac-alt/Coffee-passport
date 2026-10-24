#!/usr/bin/env python3
"""Учётки владельца в кабинеты через Supabase Admin API (service_role).

Запускается на сервере из workflow provision-cabinets (не руками, не локально).
Ключ service_role и адрес Supabase — из /opt/coffee-passport/app/.env.local.
Пароли и email приходят только JSON-ом на stdin и никогда не печатаются:
в вывод идут метка учётки, id пользователя, роль и привязка.

Режимы (argv[1]):
  inspect      — slug/name обжарщиков и кофеен, есть ли учётки (по меткам), ничего не меняет
  apply        — создать или обновить учётки (email подтверждён) и назначить роль/привязку
  temp-create  — временный энтузиаст для проверки входа (stdin: email, password)
  temp-delete  — удалить временного энтузиаста (stdin: email)

stdin для inspect/apply: {"accounts": [{"label", "email", "password"?, "role",
"roaster_id"?, "cafe_id"?}]}
"""
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ENV_FILE = Path('/opt/coffee-passport/app/.env.local')
ROLES = {'admin', 'roaster_admin', 'cafe_admin', 'enthusiast'}


def load_env():
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep:
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'), env['SUPABASE_SERVICE_ROLE_KEY']


BASE, KEY = load_env()


def call(method, path, body=None, prefer=None):
    headers = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    data = None if body is None else json.dumps(body).encode()
    request = Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        # Тело ответа GoTrue/PostgREST не содержит пароль запроса; печатаем только код и msg.
        try:
            detail = json.loads(error.read() or b'{}')
        except ValueError:
            detail = {}
        message = detail.get('msg') or detail.get('message') or detail.get('error_description') or ''
        sys.exit(f'FAIL {method} {path.split("?")[0]} -> HTTP {error.code} {message}')


def find_user(email):
    page = 1
    while True:
        _, body = call('GET', f'/auth/v1/admin/users?page={page}&per_page=200')
        users = body.get('users', []) if isinstance(body, dict) else body
        for user in users:
            if (user.get('email') or '').lower() == email.lower():
                return user
        if len(users) < 200:
            return None
        page += 1


def slugs(table):
    _, rows = call('GET', f'/rest/v1/{table}?select=slug,name&order=slug')
    return rows


def upsert_user(email, password):
    user = find_user(email)
    if user:
        _, user = call('PUT', f'/auth/v1/admin/users/{user["id"]}', {'password': password, 'email_confirm': True})
        return user, 'updated'
    _, user = call('POST', '/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True})
    return user, 'created'


def set_profile(user_id, role, roaster_id=None, cafe_id=None):
    profile = {'id': user_id, 'role': role, 'roaster_id': roaster_id, 'cafe_id': cafe_id, 'barista_id': None}
    _, rows = call('POST', '/rest/v1/profiles?on_conflict=id', profile,
                   prefer='resolution=merge-duplicates,return=representation')
    if not rows or rows[0].get('role') != role:
        sys.exit(f'FAIL profile {user_id}: роль не записалась')
    return rows[0]


def inspect(accounts):
    print('roasters:', json.dumps(slugs('roasters'), ensure_ascii=False))
    print('coffee_shops:', json.dumps(slugs('coffee_shops'), ensure_ascii=False))
    for account in accounts:
        user = find_user(account['email'])
        print(f'{account["label"]}: ' + (f'exists id={user["id"]}' if user else 'absent'))


def apply(accounts):
    roasters = {row['slug'] for row in slugs('roasters')}
    shops = {row['slug'] for row in slugs('coffee_shops')}
    # Сначала проверить всё, потом менять: никаких полу-созданных наборов.
    for account in accounts:
        if account['role'] not in ROLES or len(account.get('password') or '') < 20:
            sys.exit(f'FAIL {account["label"]}: роль неизвестна или пароль короче 20 символов')
        if account['role'] == 'roaster_admin' and account.get('roaster_id') not in roasters:
            sys.exit(f'FAIL {account["label"]}: обжарщика {account.get("roaster_id")!r} нет в roasters')
        if account['role'] == 'cafe_admin' and account.get('cafe_id') not in shops:
            sys.exit(f'FAIL {account["label"]}: кофейни {account.get("cafe_id")!r} нет в coffee_shops')
    for account in accounts:
        user, action = upsert_user(account['email'], account['password'])
        profile = set_profile(user['id'], account['role'], account.get('roaster_id'), account.get('cafe_id'))
        confirmed = 'yes' if user.get('email_confirmed_at') else 'NO'
        print(f'{account["label"]}: {action} id={user["id"]} email_confirmed={confirmed} '
              f'role={profile["role"]} roaster_id={profile["roaster_id"]} cafe_id={profile["cafe_id"]}')
        if confirmed != 'yes':
            sys.exit(f'FAIL {account["label"]}: email не подтверждён')


def temp_create(payload):
    if find_user(payload['email']):
        sys.exit('FAIL temp: учётка уже есть — удалите прошлую (temp-delete)')
    _, user = call('POST', '/auth/v1/admin/users',
                   {'email': payload['email'], 'password': payload['password'], 'email_confirm': True})
    print(f'temp enthusiast: created id={user["id"]}')


def temp_delete(payload):
    user = find_user(payload['email'])
    if not user:
        print('temp enthusiast: absent')
        return
    call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
    print(f'temp enthusiast: deleted id={user["id"]}')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    payload = json.load(sys.stdin)
    handlers = {
        'inspect': lambda: inspect(payload['accounts']),
        'apply': lambda: apply(payload['accounts']),
        'temp-create': lambda: temp_create(payload),
        'temp-delete': lambda: temp_delete(payload),
    }
    if mode not in handlers:
        sys.exit('usage: provision-cabinets.py inspect|apply|temp-create|temp-delete < payload.json')
    handlers[mode]()
