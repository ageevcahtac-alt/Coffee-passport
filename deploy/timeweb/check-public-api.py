#!/usr/bin/env python3
"""Read-only checks; never prints keys or response data."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

env = {}
for line in Path('/opt/coffee-passport/app/.env.local').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep:
        env[key] = value.strip().strip('"').strip("'")
base = env['NEXT_PUBLIC_SUPABASE_URL']
for path in ['/auth/v1/health', '/rest/v1/lots?select=public_id&limit=1', '/storage/v1/status']:
    key = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    request = Request(base + path, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    with urlopen(request, timeout=20) as response:
        print(path, response.status)
for path in ['/', '/pg/']:
    try:
        urlopen(base + path, timeout=20)
    except HTTPError as error:
        print('Blocked administrative path', path, error.code)
        assert error.code == 404
    else:
        raise SystemExit('Administrative proxy unexpectedly exposed')
