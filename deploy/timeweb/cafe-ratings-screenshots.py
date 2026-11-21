#!/usr/bin/env python3
"""Скриншоты рейтинга кофеен «зёрнами» (0052) — временные учётки и строки.

Запускается на сервере из workflow cafe-ratings-screenshots (не руками, не
локально). Адрес Supabase и service_role — из /opt/coffee-passport/app/.env.local.
Email и пароли приходят только JSON-ом на stdin и никогда не печатаются:
в вывод идут метки, id строк, счётчики и HTTP-коды.

Режимы (argv[1]):
  prepare — (1) убедиться, что строка-партнёр кофейны есть в coffee_shops
            (идемпотентная тонкая строка ровно того вида, что создаёт
            app/api/cafe/map-profile при первом сохранении: без неё карточка
            на /map — только сид, FK рейтингов не на что ссылаться, а гость
            не увидит секцию оценки); (2) создать временных гостей и их
            активные оценки кофейны (cafe_id из payload): N «сидов» с
            оценками/отзывами (их данные видны на публичной карточке и в
            кабинете) + 1 «актёр» без оценки (форма оценки заполняется
            playwright'ом через живой UI). Оценки сидов кладутся напрямую в
            cafe_ratings (сервис-роль) — RPC-путь этим прогоном тоже
            закрывается, но через UI актёра. Строка-партнёр ПОСЛЕ прогона
            остаётся (реальные данные каталога; админ ей владеет дальше).
            stdin: cafe_id, partner: {slug,name,status,brand_color,city,lat,lng},
                   seeds: [{email,password,display_name,score,review}],
                   actor: {email,password,display_name}
  purge   — удалить всех временных гостей этого прогона и их строк
            (cafe_ratings по user_id, profiles, auth user — каскадом).
            Строку-партнёр НЕ трогает.
            stdin: {emails: [...]} — каждый обязан быть по шаблону
            cafe-ratings-seed-<run>-<буква>@example.com или
            cafe-ratings-actor-<run>@example.com.

Имена учёток — только по шаблону: страховка от случайного удаления чужого.
"""
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ENV_FILE = Path('/opt/coffee-passport/app/.env.local')
EMAIL_RE = re.compile(r'cafe-ratings-(seed-\d+-[a-z]|actor-\d+)@example\.com')


def load_env():
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep:
            env[key.strip()] = value.strip().strip('"').strip("'")
    return (env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'), env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
            env['SUPABASE_SERVICE_ROLE_KEY'])


BASE, ANON, SERVICE = load_env()


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


def checked_email(email):
    if not EMAIL_RE.fullmatch(email):
        sys.exit(f'FAIL: email {email!r} не по шаблону cafe-ratings-(seed|actor)-<run>@example.com')
    return email


def create_guest(entry, cafe_id, with_rating):
    email = checked_email(entry['email'])
    if find_user(email):
        sys.exit(f'FAIL guest {email.split("@")[0]}: учётка уже есть — удалите прошлую (purge)')
    _, user = call('POST', '/auth/v1/admin/users',
                   {'email': email, 'password': entry['password'], 'email_confirm': True})
    user_id = user['id']
    call('POST', '/rest/v1/profiles?on_conflict=id',
         {'id': user_id, 'role': 'enthusiast', 'display_name': entry['display_name']},
         prefer='resolution=merge-duplicates,return=minimal')
    label = email.split('@')[0]
    if not with_rating:
        print(f'{label}: created id={user_id} (без оценки — форма через UI)')
        return user_id
    _, rows = call('POST', '/rest/v1/cafe_ratings',
                   {'cafe_id': cafe_id, 'user_id': user_id,
                    'score': entry['score'], 'review': entry.get('review')},
                   prefer='return=representation')
    print(f'{label}: created id={user_id} rating id={rows[0]["id"]} score={rows[0]["score"]}')
    return user_id


def ensure_partner_row(partner):
    # Идемпотентно: если строки-партнёра ещё нет (карточка на /map живёт
    # только сидом), создать тонкую строку — ровно то, что делает
    # app/api/cafe/map-profile при первом сохранении кабинетом. Данные
    # строки (координаты/город/цвет) — из сида; дальше ей владеет админ.
    slug = partner['slug']
    _, rows = call('GET', f'/rest/v1/coffee_shops?select=slug&slug=eq.{slug}')
    if rows:
        print(f'partner row: exists slug={slug}')
        return
    row = {key: partner[key] for key in ('slug', 'name', 'status', 'brand_color', 'city', 'lat', 'lng')}
    call('POST', '/rest/v1/coffee_shops', row, prefer='return=representation')
    print(f'partner row: created slug={slug}')


def prepare(payload):
    cafe_id = payload['cafe_id']
    ensure_partner_row(payload['partner'])
    # Факт ДО сидов: workflow учитывает уже существующие оценки в ожиданиях
    # (среднее/количество), а не предполагает пустую кофейню.
    _, rows = call('GET', f'/rest/v1/cafe_ratings?select=score&cafe_id=eq.{cafe_id}&deleted_at=is.null')
    print('EXISTING_SCORES=' + ','.join(str(r['score']) for r in rows))
    for entry in payload.get('seeds', []):
        create_guest(entry, cafe_id, with_rating=True)
    actor = payload.get('actor')
    if actor:
        create_guest(actor, cafe_id, with_rating=False)
    # Факт состояния после сидов — workflow сверяет ожидания скриншотов.
    _, rows = call('GET', f'/rest/v1/cafe_ratings?select=score&cafe_id=eq.{cafe_id}&deleted_at=is.null')
    print(f'RATINGS_SEEDED={len(rows)}')


def purge(payload):
    for email in payload['emails']:
        email = checked_email(email)
        user = find_user(email)
        label = email.split('@')[0]
        if not user:
            print(f'{label}: absent')
            continue
        user_id = user['id']
        _, deleted = call('DELETE', f'/rest/v1/cafe_ratings?user_id=eq.{user_id}',
                          prefer='return=representation')
        print(f'{label}: deleted {len(deleted)} cafe_ratings')
        call('DELETE', f'/rest/v1/profiles?id=eq.{user_id}')
        call('DELETE', f'/auth/v1/admin/users/{user_id}')
        print(f'{label}: deleted id={user_id}')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    payload = json.load(sys.stdin)
    if mode == 'prepare':
        prepare(payload)
    elif mode == 'purge':
        purge(payload)
    else:
        sys.exit('usage: cafe-ratings-screenshots.py prepare|purge  (JSON on stdin)')
