#!/usr/bin/env python3
"""Временная учётка для проверки входа по email+паролю через домен (workflow domain-https).

Запускается на сервере. Адрес Supabase и service_role — из /opt/coffee-passport/app/.env.local.
Email и пароль приходят JSON-ом на stdin ({"email", "password"}) и не печатаются.
  create — создать подтверждённого пользователя (без ролей и профиля staff)
  delete — удалить его (повторный вызов без пользователя — ok)
"""
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

env = {}
for line in Path('/opt/coffee-passport/app/.env.local').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep:
        env[key.strip()] = value.strip().strip('"').strip("'")
BASE = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SERVICE = env['SUPABASE_SERVICE_ROLE_KEY']


def call(method, path, body=None):
    headers = {'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE, 'Content-Type': 'application/json'}
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(BASE + path, data=data, method=method, headers=headers), timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        sys.exit(f'FAIL {method} {path.split("?")[0]} -> HTTP {error.code}')


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


temp = json.load(sys.stdin)
print(f'supabase base: {BASE}')
if sys.argv[1] == 'create':
    user = call('POST', '/auth/v1/admin/users', {'email': temp['email'], 'password': temp['password'], 'email_confirm': True})
    print(f'created user {user["id"]}')
elif sys.argv[1] == 'delete':
    user = find(temp['email'])
    if user:
        call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
        print(f'deleted user {user["id"]}')
    else:
        print('no temp user')
    if find(temp['email']):
        sys.exit('FAIL temp user still exists')
