#!/bin/bash
# Adds exact domain/IP callback and recovery destinations without switching API URLs.
set -euo pipefail
cd /opt/coffee-passport/supabase
test -f docker-compose.local.yml
backup=/opt/coffee-passport/backups/auth-redirects-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -a .env "$backup/supabase.env"
python3 - <<'PY'
from pathlib import Path
p=Path('.env')
lines=p.read_text().splitlines()
urls=[]
for line in lines:
 key,_,value=line.partition('=')
 if key=='ADDITIONAL_REDIRECT_URLS': urls=value.strip().strip('"').strip("'").split(',')
for origin in ['https://coffeepassport.ru','https://147.45.102.186']:
 for path in ['/auth/callback','/auth/reset-password']:
  if origin+path not in urls: urls.append(origin+path)
lines=[line for line in lines if not line.startswith('ADDITIONAL_REDIRECT_URLS=')]
lines.append('ADDITIONAL_REDIRECT_URLS='+','.join(url for url in urls if url))
p.write_text('\n'.join(lines)+'\n')
PY
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-deps auth
echo "BACKUP=$backup"
