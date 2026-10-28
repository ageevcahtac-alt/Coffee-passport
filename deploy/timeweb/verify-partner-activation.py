#!/usr/bin/env python3
"""Временные данные для workflow verify-partner-activation.

Запускается на сервере. Адрес Supabase и service_role — из /opt/coffee-passport/app/.env.local.
На stdin — JSON {"admin": {email, password}, "company": "..."}; email и пароль не печатаются.
  create  — учётка admin и временная заявка кофейни (Москва, контакт и email подставные).
            Печатает REQUEST_ID=<id>.
  xo      — заявка XO Coffee (ab107366-…): только id и статус, без контакта. Только чтение.
  cleanup — удалить кофейню этой заявки (по partner_request_id и по названию), саму заявку и учётку.
            Повторный вызов — ok. Печатает, что осталось (должно быть 0).
"""
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

env = {}
for line in Path('/opt/coffee-passport/app/.env.local').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep:
        env[key.strip()] = value.strip().strip('"').strip("'")
BASE = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SERVICE = env['SUPABASE_SERVICE_ROLE_KEY']
XO_REQUEST_ID = 'ab107366-51ea-4cbf-bba0-c4fb8b83872c'


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


def find_user(email):
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


def requests_by_company(company):
    return call('GET', f'/rest/v1/partner_requests?select=id,status&company_name=eq.{quote(company)}')


def create(temp):
    user = call('POST', '/auth/v1/admin/users',
                {'email': temp['admin']['email'], 'password': temp['admin']['password'], 'email_confirm': True})
    rows = call('POST', '/rest/v1/profiles?on_conflict=id',
                {'id': user['id'], 'role': 'admin', 'cafe_id': None, 'roaster_id': None, 'barista_id': None},
                prefer='resolution=merge-duplicates,return=representation')
    if not rows or rows[0].get('role') != 'admin':
        sys.exit(f'FAIL profile {user["id"]}: роль не записалась')
    print(f'created admin user {user["id"]}')
    request = call('POST', '/rest/v1/partner_requests',
                   {'company_name': temp['company'], 'city': 'Москва', 'contact_name': 'verify',
                    'email': 'partner-verify@example.com', 'role_requested': 'coffee_shop', 'status': 'new'},
                   prefer='return=representation')
    print(f'created partner_request {request[0]["id"]} status={request[0]["status"]}')
    print(f'REQUEST_ID={request[0]["id"]}')


def xo():
    rows = call('GET', f'/rest/v1/partner_requests?select=id,role_requested,status,updated_at&id=eq.{XO_REQUEST_ID}')
    print('XO request: ' + (json.dumps(rows[0], ensure_ascii=False) if rows else 'not found'))
    shop = call('GET', '/rest/v1/coffee_shops?select=slug,status,partner_request_id&slug=eq.shop-xo-vsevolozhsk')
    print(f'coffee_shops shop-xo-vsevolozhsk rows: {len(shop)}')


def cleanup(temp):
    company = temp['company']
    for request in requests_by_company(company):
        call('DELETE', f'/rest/v1/coffee_shops?partner_request_id=eq.{request["id"]}')
        call('DELETE', f'/rest/v1/partner_requests?id=eq.{request["id"]}')
        print(f'deleted partner_request {request["id"]} and its coffee shop')
    call('DELETE', f'/rest/v1/coffee_shops?name=eq.{quote(company)}')
    user = find_user(temp['admin']['email'])
    if user:
        call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
        print(f'deleted admin user {user["id"]}')
    left_requests = len(requests_by_company(company))
    left_shops = len(call('GET', f'/rest/v1/coffee_shops?select=slug&name=eq.{quote(company)}'))
    left_user = 1 if find_user(temp['admin']['email']) else 0
    print(f'left: partner_requests={left_requests} coffee_shops={left_shops} admin_users={left_user}')
    if left_requests or left_shops or left_user:
        sys.exit('FAIL временные данные остались')


temp = {} if sys.argv[1:] == ["xo"] else json.load(sys.stdin)
print(f'supabase base: {BASE}')
if sys.argv[1] == 'create':
    create(temp)
elif sys.argv[1] == 'xo':
    xo()
elif sys.argv[1] == 'cleanup':
    cleanup(temp)
else:
    sys.exit('usage: create | xo | cleanup')
