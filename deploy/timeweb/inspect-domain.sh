#!/bin/bash
set -euo pipefail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/coffee-passport/backups/domain-$stamp
install -d -m 700 "$backup"
cp -a /etc/nginx "$backup/nginx"
cp -a /opt/coffee-passport/app/.next "$backup/next"
find /opt/coffee-passport/app -maxdepth 1 -name '.env*' -exec cp -a {} "$backup/" \;
cp -a /opt/coffee-passport/supabase/.env "$backup/supabase.env"
echo "BACKUP=$backup"
cat /etc/systemd/system/coffee-passport.service
ps -eo pid,comm,args | grep -E 'nginx|next-server' | head -15
systemctl list-timers --all --no-pager | grep -E 'cert|coffee' || true
python3 - <<'PY'
from pathlib import Path
for file in [Path('/opt/coffee-passport/app/.env.local'),Path('/opt/coffee-passport/supabase/.env')]:
 print(str(file))
 for line in file.read_text().splitlines():
  if line.startswith(('NEXT_PUBLIC_SUPABASE_URL=','SITE_URL=','API_EXTERNAL_URL=','ADDITIONAL_REDIRECT_URLS=','SUPABASE_PUBLIC_URL=')):
   print(line)
PY
