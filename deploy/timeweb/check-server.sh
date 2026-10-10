#!/bin/bash
set -euo pipefail
curl -sI --max-time 15 https://147.45.102.186/auth/callback
curl -sI --max-time 15 https://147.45.102.186/auth/reset-password
echo 'Actual public domain response:'
curl -sI --max-time 15 https://coffeepassport.ru/ || true
echo 'IP certificate:'
openssl x509 -in /etc/letsencrypt/live/coffee-passport-ip/fullchain.pem -noout -dates -ext subjectAltName
systemctl show coffee-passport-cert-renew.service -p Result -p ExecMainStatus
systemctl is-enabled coffee-passport-cert-renew.timer
python3 - <<'PY'
from pathlib import Path
from urllib.request import Request, urlopen
env={}
for line in Path('/opt/coffee-passport/app/.env.local').read_text().splitlines():
 key,sep,value=line.partition('=')
 if sep: env[key]=value.strip().strip('"').strip("'")
request=Request(env['NEXT_PUBLIC_SUPABASE_URL']+'/auth/v1/health',headers={'apikey':env['NEXT_PUBLIC_SUPABASE_ANON_KEY']})
with urlopen(request,timeout=15) as response:
 print('Supabase Auth health with public key:',response.status)
PY
