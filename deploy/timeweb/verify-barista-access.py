#!/usr/bin/env python3
"""Доступ бариста и списание баллов — на живой базе.

Запускается на сервере из workflow verify-barista-access (не руками, не локально).
Адрес Supabase, anon key и service_role — из /opt/coffee-passport/app/.env.local.
Email и пароли приходят только JSON-ом на stdin и никогда не печатаются:
в вывод идут метки, id строк, суммы, счётчики и HTTP-коды.

Режимы (argv[1]):
  prepare  — состояние учётки бариста (reset_barista: удалить прежнюю учётку бариста этой кофейни),
             временный гость (энтузиаст) с абонементом 1000 ₽ в кофейне, снимок чужих строк.
             stdin: cafe_id, barista{email}, guest{email,password,display_name}, reset_barista
  check    — expect=present: учётка бариста, абонемент гостя списан на amount, одна операция
             deduct_points от этого бариста; та же операция глазами кабинета кофейни (вход паролем
             и чтение loyalty_transactions по shop_id, как lib/data/loyalty.ts).
             expect=absent: гостя и его строк нет нигде. В обоих — чужие строки как в снимке.
             stdin: cafe_id, barista{email}, guest{email}, cafe{email,password}, amount, guest_id,
             subscription_id. Снимок чужих строк — файл <скрипт>.others.json от prepare.
  gate     — временный бариста этого прогона (создан кофейней через интерфейс): у учётки нет прав бариста;
             GoTrue по временному паролю выдаёт токен, но списание, продажа абонемента и чтение лояльности
             гостя этим токеном отклоняются, баланс гостя не меняется. Затем срок временного пароля
             переводится в прошлое («просроченный пароль не пускает» проверяет интерфейс).
             stdin: cafe_id, guest_id, subscription_id, temp_barista{email,temp_password}
  purge    — удалить временного гостя (строки лояльности, оценки) и временного бариста этого прогона
             (stdin: guest{email}, temp_barista{email})

Временный бариста — email barista-verify-temp-<run>@example.com, его создаёт только этот workflow.
"""
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ENV_FILE = Path('/opt/coffee-passport/app/.env.local')
SNAPSHOT_FILE = Path(sys.argv[0] + '.others.json')
GUEST_EMAIL_RE = re.compile(r'barista-verify-guest-\d+@example\.com')
TEMP_BARISTA_EMAIL_RE = re.compile(r'barista-verify-temp-\d+@example\.com')
NOMINAL = 1000
LOYALTY_TABLES = ('loyalty_transactions', 'subscriptions', 'guest_shop_statuses')


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


def attempt(method, path, body, token):
    # Запрос, который ДОЛЖЕН быть отклонён: код ответа без выхода из скрипта.
    headers = {'apikey': ANON, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    data = None if body is None else json.dumps(body).encode()
    request = Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        try:
            detail = json.loads(error.read() or b'{}')
        except ValueError:
            detail = {}
        return error.code, detail.get('message') or detail.get('msg') or ''


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


def expect(label, ok, detail):
    print(f'{"PASS" if ok else "FAIL"} {label}: {detail}')
    if not ok:
        failures.append(label)


def temp_barista_email(payload):
    email = payload['temp_barista']['email']
    if not TEMP_BARISTA_EMAIL_RE.fullmatch(email):
        sys.exit('FAIL temp barista: email не по шаблону barista-verify-temp-<run>@example.com')
    return email


def guest_email(payload):
    email = payload['guest']['email']
    if not GUEST_EMAIL_RE.fullmatch(email):
        sys.exit('FAIL guest: email временного гостя не по шаблону barista-verify-guest-<run>@example.com')
    return email


SNAPSHOT_COLUMNS = {
    'loyalty_transactions': 'id,guest_id,type,net_amount,subscription_id',
    'subscriptions': 'id,guest_id,current_balance,status,updated_at',
    'guest_shop_statuses': 'id,guest_id,visits_count,total_spent,updated_at',
    'checkins': 'id,owner_user_id,barista_id,barista_rating',
}
# У оценок свои имена колонок кофейни и владельца строки.
SHOP_COLUMN = {'checkins': 'coffee_shop_id'}
OWNER_COLUMN = {'checkins': 'owner_user_id'}


def others_snapshot(cafe_id, guest_id):
    # Чужие строки этой кофейни (всё, кроме временного гостя), построчно: id -> отпечаток.
    shop = quote(cafe_id)
    snapshot = {}
    for table, columns in SNAPSHOT_COLUMNS.items():
        rows, offset = [], 0
        shop_col, owner_col = SHOP_COLUMN.get(table, 'shop_id'), OWNER_COLUMN.get(table, 'guest_id')
        while True:  # постранично и по id: лимит строк PostgREST не обрежет снимок молча
            _, page = call('GET', f'/rest/v1/{table}?select={columns}&{shop_col}=eq.{shop}&{owner_col}=neq.{guest_id}'
                                  f'&order=id&limit=1000&offset={offset}')
            rows += page
            if len(page) < 1000:
                break
            offset += 1000
        # compare_others узнаёт владельца строки по guest_id — у оценок это owner_user_id.
        snapshot[table] = {row['id']: json.dumps({**row, 'guest_id': row.get(owner_col)}, sort_keys=True)
                           for row in rows}
    return snapshot


def compare_others(before, now):
    # Строки, которые были до прогона, не изменились и не пропали. Новые строки — это настоящие
    # продажи и списания, прошедшие во время прогона: их не трогаем и не считаем сбоем.
    # Гость с новой реальной операцией за время прогона законно меняет свой абонемент и статус — его строки
    # не считаются сбоем. Пропавшая строка — сбой всегда.
    new_tx = set(now['loyalty_transactions']) - set(before['loyalty_transactions'])
    active = {json.loads(now['loyalty_transactions'][tx_id])['guest_id'] for tx_id in new_tx}
    changed = {table: sum(1 for row_id, mark in rows.items()
                          if row_id not in now[table]
                          or (now[table][row_id] != mark and json.loads(mark)['guest_id'] not in active))
               for table, rows in before.items()}
    added = {table: len(set(now[table]) - set(rows)) for table, rows in before.items()}
    sizes = {table: len(rows) for table, rows in before.items()}
    expect('other guests untouched', not any(changed.values()),
           f'строк до прогона {json.dumps(sizes, sort_keys=True)}; изменились или пропали '
           f'{json.dumps(changed, sort_keys=True)}; новые (реальные операции во время прогона) '
           f'{json.dumps(added, sort_keys=True)}')


def barista_state(cafe_id, email):
    user = find_user(email)
    if not user:
        return None, None
    _, rows = call('GET', f'/rest/v1/profiles?select=role,cafe_id,barista_id&id=eq.{user["id"]}')
    return user, (rows[0] if rows else None)


def prepare(payload):
    cafe_id = payload['cafe_id']
    email = guest_email(payload)
    user, profile = barista_state(cafe_id, payload['barista']['email'])
    if user and (not profile or profile['role'] != 'barista' or profile['cafe_id'] != cafe_id):
        sys.exit('FAIL barista: email занят учёткой, которая не бариста этой кофейни — не трогаю')
    if user and payload.get('reset_barista'):
        call('DELETE', f'/rest/v1/barista_profiles?id=eq.{quote(profile["barista_id"])}&coffee_shop_id=eq.{quote(cafe_id)}')
        call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
        print(f'barista: reset (deleted id={user["id"]})')
        user = None
    print(f'BARISTA_STATE={"exists" if user else "absent"}')

    if find_user(email):
        sys.exit('FAIL guest: учётка уже есть — удалите прошлую (purge)')
    if find_user(temp_barista_email(payload)):
        sys.exit('FAIL temp barista: учётка уже есть — удалите прошлую (purge)')
    _, guest = call('POST', '/auth/v1/admin/users',
                    {'email': email, 'password': payload['guest']['password'], 'email_confirm': True})
    guest_id = guest['id']
    print(f'temp guest: created id={guest_id}')
    print(f'GUEST_ID={guest_id}')
    call('POST', '/rest/v1/profiles?on_conflict=id',
         {'id': guest_id, 'role': 'enthusiast', 'display_name': payload['guest']['display_name']},
         prefer='resolution=merge-duplicates,return=minimal')
    _, subs = call('POST', '/rest/v1/subscriptions',
                   {'guest_id': guest_id, 'shop_id': cafe_id, 'initial_nominal': NOMINAL,
                    'current_balance': NOMINAL, 'status': 'active'},
                   prefer='return=representation')
    print(f'temp guest: subscription id={subs[0]["id"]} balance={subs[0]["current_balance"]}')
    print(f'SUBSCRIPTION_ID={subs[0]["id"]}')
    # Построчный снимок чужих строк (id гостей, балансы) остаётся на сервере рядом со скриптом —
    # в лог Actions идут только счётчики. Workflow удаляет файл вместе со скриптом.
    others = others_snapshot(cafe_id, guest_id)
    SNAPSHOT_FILE.write_text(json.dumps(others))
    SNAPSHOT_FILE.chmod(0o600)
    print('others: ' + json.dumps({table: len(rows) for table, rows in others.items()}, sort_keys=True))
    # Лот для оценки гостя: любой активный (форма оценки одна для всех лотов).
    _, lots = call('GET', '/rest/v1/lots?select=public_id&status=eq.active&order=public_id&limit=1')
    if not lots:
        sys.exit('FAIL нет активных лотов для оценки')
    print(f'LOT_ID={lots[0]["public_id"]}')


def temp_barista_state(payload):
    user = find_user(temp_barista_email(payload))
    if not user:
        return None, None
    _, rows = call('GET', f'/rest/v1/profiles?select=role,cafe_id,barista_id&id=eq.{user["id"]}')
    return user, (rows[0] if rows else None)


def gate(payload):
    cafe_id = payload['cafe_id']
    guest_id = payload['guest_id']
    user, profile = temp_barista_state(payload)
    if not user:
        sys.exit('FAIL temp barista: учётки нет — кофейня её не создала')
    meta = user.get('app_metadata') or {}
    expect('temporary login has no barista rights',
           meta.get('must_change_password') is True and profile is not None and profile['role'] == 'enthusiast'
           and meta.get('cafe_id') == cafe_id and bool(meta.get('temporary_password_expires_at')),
           f'must_change_password={meta.get("must_change_password")} role={profile and profile["role"]} '
           f'cafe={"this" if meta.get("cafe_id") == cafe_id else meta.get("cafe_id")} '
           f'expires_at={meta.get("temporary_password_expires_at")}')
    token = sign_in({'email': user['email'], 'password': payload['temp_barista']['temp_password']})
    print('temp barista: GoTrue выдал токен по временному паролю — проверяем, что действия бариста закрыты')
    redeem = attempt('POST', '/rest/v1/rpc/loyalty_redeem',
                     {'p_guest_id': guest_id, 'p_shop_id': cafe_id, 'p_gross_amount': 1,
                      'p_subscription_id': payload['subscription_id']}, token)
    expect('API refuses redeem before password change', redeem[0] >= 400,
           f'rpc loyalty_redeem -> HTTP {redeem[0]} {redeem[1]}')
    sell = attempt('POST', '/rest/v1/rpc/loyalty_sell_subscription',
                   {'p_guest_id': guest_id, 'p_shop_id': cafe_id, 'p_nominal': 500}, token)
    expect('API refuses subscription sale before password change', sell[0] >= 400,
           f'rpc loyalty_sell_subscription -> HTTP {sell[0]} {sell[1]}')
    read = attempt('GET', f'/rest/v1/subscriptions?select=id&guest_id=eq.{guest_id}', None, token)
    expect('API hides guest loyalty before password change', read[0] == 200 and read[1] == [],
           f'GET subscriptions гостя -> HTTP {read[0]}, строк {len(read[1]) if isinstance(read[1], list) else read[1]}')
    _, subs = call('GET', f'/rest/v1/subscriptions?select=current_balance&guest_id=eq.{guest_id}')
    _, txs = call('GET', f'/rest/v1/loyalty_transactions?select=id&guest_id=eq.{guest_id}')
    expect('guest untouched by refused calls',
           len(subs) == 1 and float(subs[0]['current_balance']) == NOMINAL and not txs,
           f'абонементов {len(subs)}, баланс {subs[0]["current_balance"] if subs else None}, операций {len(txs)}')
    # Срок временного пароля — в прошлое: дальше интерфейс должен отказать во входе.
    call('PUT', f'/auth/v1/admin/users/{user["id"]}',
         {'app_metadata': {'temporary_password_expires_at': '2000-01-01T00:00:00Z'}})
    print('temp barista: срок временного пароля переведён в прошлое')
    print(f'TEMP_BARISTA_ID={meta.get("barista_id")}')
    if failures:
        sys.exit(f'FAIL: {len(failures)} проверок не прошли')


def check(payload):
    cafe_id = payload['cafe_id']
    guest_id = payload['guest_id']
    amount = float(payload['amount'])
    shop = quote(cafe_id)

    user, profile = barista_state(cafe_id, payload['barista']['email'])
    expect('barista account', bool(user) and bool(profile) and profile['role'] == 'barista'
           and profile['cafe_id'] == cafe_id,
           f'id={user["id"] if user else None} role={profile and profile["role"]} cafe_id={profile and profile["cafe_id"]}')
    if user:
        flag = (user.get('app_metadata') or {}).get('must_change_password')
        expect('barista changed temporary password', flag is False, f'must_change_password={flag}')

    rows = {}
    for table in LOYALTY_TABLES:
        _, rows[table] = call('GET', f'/rest/v1/{table}?select=*&guest_id=eq.{guest_id}')
    _, guest_profile = call('GET', f'/rest/v1/profiles?select=id&id=eq.{guest_id}')
    guest_user = find_user(guest_email(payload))

    cafe_token = sign_in(payload['cafe'])
    _, cafe_rows = call('GET', f'/rest/v1/loyalty_transactions?select=id,type,gross_amount,net_amount,barista_id'
                               f'&shop_id=eq.{shop}&guest_id=eq.{guest_id}', token=cafe_token, apikey=ANON)

    temp_user, temp_profile = temp_barista_state(payload)
    _, guest_checkins = call('GET', f'/rest/v1/checkins?select=id,barista_id,barista_rating'
                                    f'&owner_user_id=eq.{guest_id}')
    temp_card = payload.get('temp_barista_id') or ''

    if payload['expect'] == 'present':
        temp_meta = (temp_user or {}).get('app_metadata') or {}
        expect('temp barista active after reissue and password change',
               bool(temp_profile) and temp_profile['role'] == 'barista' and temp_profile['cafe_id'] == cafe_id
               and temp_profile['barista_id'] == temp_card and temp_meta.get('must_change_password') is False,
               f'role={temp_profile and temp_profile["role"]} card={"this" if temp_profile and temp_profile["barista_id"] == temp_card else None} '
               f'must_change_password={temp_meta.get("must_change_password")}')
        rated = [c for c in guest_checkins if temp_card and c['barista_id'] == temp_card]
        expect('guest rating bound to the new barista', len(rated) == 1 and rated[0]['barista_rating'] == 5,
               f'оценок гостя {len(guest_checkins)}, из них этому бариста {len(rated)}'
               + (f', оценка {rated[0]["barista_rating"]}' if rated else ''))
        subs = rows['subscriptions']
        balance = float(subs[0]['current_balance']) if subs else None
        expect('guest balance changed', len(subs) == 1 and balance == NOMINAL - amount,
               f'subscription {NOMINAL} -> {balance} (ожидалось {NOMINAL - amount:g})')
        txs = rows['loyalty_transactions']
        ok = (len(txs) == 1 and txs[0]['type'] == 'deduct_points' and float(txs[0]['net_amount']) == amount
              and user is not None and txs[0]['barista_id'] == user['id']
              and txs[0]['subscription_id'] == payload['subscription_id'])
        expect('redeem by barista', ok,
               f'{len(txs)} операций; ' + ', '.join(f'{t["type"]} {float(t["net_amount"]):g} barista={"this" if user and t["barista_id"] == user["id"] else t["barista_id"]}' for t in txs))
        expect('cafe cabinet sees the operation', len(cafe_rows) == 1 and cafe_rows[0]['type'] == 'deduct_points',
               f'{len(cafe_rows)} строк в loyalty_transactions глазами кофейни')
        print('ids: ' + ','.join(t['id'] for t in txs))
    else:
        counts = {table: len(found) for table, found in rows.items()}
        expect('guest rows removed', not any(counts.values()) and not guest_profile,
               f'{json.dumps(counts, sort_keys=True)} profiles={len(guest_profile)}')
        expect('guest account removed', guest_user is None, 'absent' if guest_user is None else f'id={guest_user["id"]}')
        expect('cafe cabinet no longer sees it', len(cafe_rows) == 0, f'{len(cafe_rows)} строк глазами кофейни')
        expect('guest ratings removed', not guest_checkins, f'{len(guest_checkins)} оценок гостя')
        _, cards = call('GET', f'/rest/v1/barista_profiles?select=id&id=eq.{quote(temp_card)}') if temp_card else (0, [])
        expect('temp barista removed', temp_user is None and not cards and bool(temp_card),
               f'учётка {"нет" if temp_user is None else "есть"}, карточек {len(cards)}')

    compare_others(json.loads(SNAPSHOT_FILE.read_text()), others_snapshot(cafe_id, guest_id))
    if failures:
        sys.exit(f'FAIL: {len(failures)} проверок не прошли')


def purge_temp_barista(payload):
    user = find_user(temp_barista_email(payload))
    if not user:
        print('temp barista: absent')
        return
    _, rows = call('GET', f'/rest/v1/profiles?select=barista_id&id=eq.{user["id"]}')
    card = (rows[0]['barista_id'] if rows else None) or (user.get('app_metadata') or {}).get('barista_id')
    if card:
        _, deleted = call('DELETE', f'/rest/v1/barista_profiles?id=eq.{quote(card)}', prefer='return=representation')
        print(f'temp barista: deleted {len(deleted)} barista_profiles')
    call('DELETE', f'/rest/v1/profiles?id=eq.{user["id"]}')
    call('DELETE', f'/auth/v1/admin/users/{user["id"]}')
    print(f'temp barista: deleted id={user["id"]}')


def purge(payload):
    purge_temp_barista(payload)
    user = find_user(guest_email(payload))
    if not user:
        print('temp guest: absent')
        return
    guest_id = user['id']
    _, deleted = call('DELETE', f'/rest/v1/checkins?owner_user_id=eq.{guest_id}', prefer='return=representation')
    print(f'temp guest: deleted {len(deleted)} checkins')
    for table in LOYALTY_TABLES:
        _, deleted = call('DELETE', f'/rest/v1/{table}?guest_id=eq.{guest_id}', prefer='return=representation')
        print(f'temp guest: deleted {len(deleted)} {table}')
    call('DELETE', f'/rest/v1/profiles?id=eq.{guest_id}')
    call('DELETE', f'/auth/v1/admin/users/{guest_id}')
    print(f'temp guest: deleted id={guest_id}')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    payload = json.load(sys.stdin)
    handlers = {'prepare': prepare, 'gate': gate, 'check': check, 'purge': purge}
    if mode not in handlers:
        sys.exit('usage: verify-barista-access.py prepare|gate|check|purge < payload.json')
    handlers[mode](payload)
