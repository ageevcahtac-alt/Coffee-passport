#!/bin/bash
set -euo pipefail
cd /opt/coffee-passport/app
backup=/opt/coffee-passport/backups/public-env-build-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -a .next "$backup/next"
cp -a .env.local "$backup/app.env"
cp -a /opt/coffee-passport/supabase/.env "$backup/supabase.env"
cp -a /etc/nginx "$backup/nginx"
old_build=$(cat .next/BUILD_ID)
echo "BACKUP=$backup"
echo "OLD_BUILD=$old_build"
grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local
npm run build
echo "NEW_BUILD=$(cat .next/BUILD_ID)"
systemctl restart coffee-passport
ready=0
for attempt in $(seq 1 30); do
 if curl --fail --silent https://147.45.102.186/ -o /dev/null; then ready=1; break; fi
 sleep 2
done
test "$ready" = 1
systemctl is-active coffee-passport
python3 deploy/timeweb/check-public-api.py
