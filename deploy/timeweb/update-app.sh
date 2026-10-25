#!/bin/bash
set -euo pipefail
cd /opt/coffee-passport/app
test -z "$(git status --porcelain)"
git pull --ff-only origin fix/pre-pilot-shortlist
npm ci --no-audit --no-fund
npm run build
systemctl restart coffee-passport
for attempt in $(seq 1 20); do
 if curl --fail --silent https://coffeepassport.ru/ -o /dev/null; then break; fi
 sleep 2
done
systemctl is-active coffee-passport
for path in / /auth/login /auth/reset-password /auth/callback /dashboard/cafe /dashboard/roaster /supabase/auth/v1/health; do
 echo "$path"
 curl --max-time 15 -sI "https://coffeepassport.ru$path" | head -8
done
echo /api/health
# До 5 минут: первый 503 сразу после рестарта не должен ронять выкатку (set -e).
health_deadline=$((SECONDS + 300))
while :; do
 if curl --fail-with-body --max-time 10 -sS https://coffeepassport.ru/api/health; then echo; break; fi
 echo; [ "$SECONDS" -ge "$health_deadline" ] && exit 1
 sleep 10
done
git rev-parse HEAD
