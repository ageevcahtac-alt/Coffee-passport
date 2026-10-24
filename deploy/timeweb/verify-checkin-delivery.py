#!/usr/bin/env python3
"""Доходят ли оценки гостя до кабинетов кофейни и обжарщика — на живой базе.

Запускается на сервере из workflow verify-checkin-delivery (не руками, не локально).
Адрес Supabase, anon key и service_role — из /opt/coffee-passport/app/.env.local.
Email и пароли приходят только JSON-ом на stdin и никогда не печатаются:
в вывод идут метки, id строк, флаги и HTTP-коды.

Режимы (argv[1]):
  prepare  — активный лот обжарщика, временный энтузиаст (stdin: roaster_slug, temp{email,password})
  check    — оценки энтузиаста (service role) и они же глазами кабинетов: вход паролем
             (как форма), чтение тех же источников, что кабинеты — checkins по coffee_shop_id
             (lib/data/cafeShopCheckins.ts) и checkins_roaster_view (lib/data/checkinsRoasterView.ts).
             stdin: expect present|absent, lot, cafe_id, ids?, temp{email}, cafe{..}, roaster{..}
  purge    — удалить оценки энтузиаста и его учётку (stdin: temp{email})
"""
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ENV_FILE = Path('/opt/coffee-passport/app/.env.local')


def load_env():
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep:
            env[key.strip()] = value.strip().strip('"').strip("'")
    return (env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'), env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
            env['SUPABASE_SERVICE_ROLE_KEY'])


BASE, ANON, SERVICE = load_env()
failures = []


def call(method, path, body=None, token=SERVICE, apikey=SERVICE, prefer=None):
    headers = {'apikey': apikey, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
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


def sign_in(account):
    # Тот же вызов, что форма входа (signInWithPassword): GoTrue password grant с anon key.
    _, session = call('POST', '/auth/v1/token?grant_type=password',
                      {'email': account['email'], 'password': account['password']}, token=ANON, apikey=ANON)
    return session['access_token']


def verdict(ok, line):
    print(('PASS ' if ok else 'FAIL ') + line)
    if not ok:
        failures.append(line)


def flags(rows):
    return sorted(str(row.get('profile_seen_before_tasting', 'нет поля')).lower() for row in rows)


def prepare(payload):
    _, roasters = call('GET', f'/rest/v1/roasters?select=id&slug=eq.{quote(payload["roaster_slug"])}')
    if not roasters:
        sys.exit(f'FAIL обжарщика {payload["roaster_slug"]!r} нет в roasters')
    _, lots = call('GET', f'/rest/v1/lots?select=public_id&status=eq.active&roaster_id=eq.{roasters[0]["id"]}'
                          '&order=public_id&limit=1')
    if not lots:
        sys.exit('FAIL у обжарщика нет активных лотов')
    print(f'LOT_ID={lots[0]["public_id"]}')
    temp = payload['temp']
    if find_user(temp['email']):
        sys.exit('FAIL temp: учётка уже есть — удалите прошлую (purge)')
    _, user = call('POST', '/auth/v1/admin/users',
                   {'email': temp['email'], 'password': temp['password'], 'email_confirm': True})
    print(f'temp enthusiast: created id={user["id"]}')


def check(payload):
    expect_present = payload['expect'] == 'present'
    user = find_user(payload['temp']['email'])
    if expect_present:
        if not user:
            sys.exit('FAIL temp: энтузиаста нет')
        _, rows = call('GET', '/rest/v1/checkins?select=id,lot_id,coffee_shop_id,roaster_id,'
                              f'profile_seen_before_tasting&owner_user_id=eq.{user["id"]}&order=created_at')
        ids = [row['id'] for row in rows]
        for row in rows:
            print(f'  оценка {row["id"]}: lot={row["lot_id"]} shop={row["coffee_shop_id"]} '
                  f'roaster={row["roaster_id"]} profile_seen_before_tasting={str(row["profile_seen_before_tasting"]).lower()}')
        verdict(len(rows) == 2 and flags(rows) == ['false', 'true']
                and all(r['lot_id'] == payload['lot'] and r['coffee_shop_id'] == payload['cafe_id'] for r in rows),
                f'база: оценок энтузиаста {len(rows)} (ожидалось 2, один лот, одна кофейня), флаги {flags(rows)}')
        print('ids: ' + ','.join(ids))
    else:
        ids = payload['ids']
        verdict(user is None, 'база: временный энтузиаст ' + ('удалён' if user is None else 'ЕЩЁ ЕСТЬ'))
        _, rows = call('GET', f'/rest/v1/checkins?select=id&id=in.({",".join(ids)})')
        verdict(len(rows) == 0, f'база: оценок с этими id {len(rows)} (ожидалось 0)')
    if not ids:
        sys.exit('FAIL нет id оценок для проверки кабинетов')
    in_ids = f'id=in.({",".join(ids)})'
    sources = {
        'кофейня': f'/rest/v1/checkins?select=*&coffee_shop_id=eq.{quote(payload["cafe_id"])}&{in_ids}',
        'обжарщик': f'/rest/v1/checkins_roaster_view?select=*&{in_ids}',
    }
    for label, account in (('кофейня', payload['cafe']), ('обжарщик', payload['roaster'])):
        token = sign_in(account)
        status, rows = call('GET', sources[label], token=token, apikey=ANON)
        if expect_present:
            verdict(len(rows) == 2 and flags(rows) == ['false', 'true'],
                    f'кабинет {label}: HTTP {status}, видно оценок {len(rows)} из 2, флаги {flags(rows)}')
        else:
            verdict(len(rows) == 0, f'кабинет {label}: HTTP {status}, видно оценок {len(rows)} (ожидалось 0)')


def purge(payload):
    user = find_user(payload['temp']['email'])
    if not user:
        print('temp enthusiast: absent')
        return
    _, deleted = call('DELETE', f'/rest/v1/checkins?owner_user_id=eq.{user["id"]}',
                      prefer='return=representation')
    print(f'temp enthusiast: deleted checkins={len(deleted or [])}')
    call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
    print(f'temp enthusiast: deleted id={user["id"]}')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    handlers = {'prepare': prepare, 'check': check, 'purge': purge}
    if mode not in handlers:
        sys.exit('usage: verify-checkin-delivery.py prepare|check|purge < payload.json')
    handlers[mode](json.load(sys.stdin))
    if failures:
        sys.exit(f'FAIL: {len(failures)} проверок не прошли')
