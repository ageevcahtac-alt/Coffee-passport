#!/usr/bin/env python3
"""Временные учётки и чтение заявок для workflow verify-admin-access.

Запускается на сервере. Адрес Supabase и service_role — из /opt/coffee-passport/app/.env.local.
На stdin — JSON {"admin": {email, password}, "cafe": {email, password}, "cafe_id", "xo_request_id"}; email и пароли не печатаются.
  create — создать подтверждённые учётки: роль admin и роль cafe_admin этой кофейни
  lookup — заявка XO Coffee по id (xo_request_id), без привязки к дате: id, роль, статус, время, компания, город.
           Контакт, email, телефон, комментарий не запрашиваются. Печатает XO_REQUEST_ID=<id>; заявки нет — FAIL.
           Только чтение: заявки не меняются.
  delete — удалить обе учётки (профили удаляются каскадом); повторный вызов без учёток — ok
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone
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
MSK = timezone(timedelta(hours=3))


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


def create(account, role, cafe_id=None):
    user = call('POST', '/auth/v1/admin/users',
                {'email': account['email'], 'password': account['password'], 'email_confirm': True})
    profile = {'id': user['id'], 'role': role, 'cafe_id': cafe_id, 'roaster_id': None, 'barista_id': None}
    rows = call('POST', '/rest/v1/profiles?on_conflict=id', profile,
                prefer='resolution=merge-duplicates,return=representation')
    if not rows or rows[0].get('role') != role:
        sys.exit(f'FAIL profile {user["id"]}: роль не записалась')
    print(f'created {role} user {user["id"]}' + (f' cafe_id={cafe_id}' if cafe_id else ''))


def lookup(request_id):
    if not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', request_id or ''):
        sys.exit('FAIL xo_request_id — не uuid')
    rows = call('GET', '/rest/v1/partner_requests?select=id,role_requested,status,created_at,company_name,city'
                       f'&id=eq.{request_id}')
    if not rows:
        sys.exit(f'FAIL нет заявки XO Coffee с id {request_id}')
    row = rows[0]
    local = datetime.fromisoformat(row['created_at'].replace('Z', '+00:00')).astimezone(MSK)
    print(json.dumps({**row, 'created_at_msk': local.isoformat(timespec='seconds')}, ensure_ascii=False))
    print(f'XO_REQUEST_ID={row["id"]}')


temp = json.load(sys.stdin)
print(f'supabase base: {BASE}')
if sys.argv[1] == 'create':
    create(temp['admin'], 'admin')
    create(temp['cafe'], 'cafe_admin', temp['cafe_id'])
elif sys.argv[1] == 'lookup':
    lookup(temp.get('xo_request_id'))
elif sys.argv[1] == 'delete':
    for label in ('admin', 'cafe'):
        user = find(temp[label]['email'])
        if user:
            call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
            print(f'deleted {label} user {user["id"]}')
        else:
            print(f'no temp {label} user')
        if find(temp[label]['email']):
            sys.exit(f'FAIL temp {label} user still exists')
else:
    sys.exit('usage: create | lookup | delete')
