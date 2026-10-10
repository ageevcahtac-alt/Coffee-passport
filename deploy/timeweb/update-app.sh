#!/bin/bash
set -euo pipefail
cd /opt/coffee-passport/app
test -z "$(git status --porcelain)"
git pull --ff-only origin fix/pre-pilot-shortlist
npm run build
systemctl restart coffee-passport
for attempt in $(seq 1 20); do
 if curl --fail --silent https://147.45.102.186/ -o /dev/null; then break; fi
 sleep 2
done
systemctl is-active coffee-passport
for path in / /auth/login /auth/reset-password /auth/callback /dashboard/cafe /dashboard/roaster /supabase/auth/v1/health; do
 echo "$path"
 curl --max-time 15 -sI "https://147.45.102.186$path" | head -8
done
git rev-parse HEAD
