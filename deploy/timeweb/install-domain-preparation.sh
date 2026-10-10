#!/bin/bash
set -euo pipefail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/coffee-passport/backups/domain-www-$stamp
install -d -m 700 "$backup"
cp -a /etc/nginx "$backup/nginx"
cp -a /etc/systemd/system/coffee-passport-cert-renew.service "$backup/"
cp -a /opt/coffee-passport/app/.env.local "$backup/app.env"
cp -a /opt/coffee-passport/supabase/.env "$backup/supabase.env"
cp -a /opt/coffee-passport/app/.next "$backup/next"
cp -a /opt/coffee-passport/activate-domain.sh "$backup/activate-domain.sh"
install -m 600 /tmp/activate-domain.sh /opt/coffee-passport/activate-domain.sh
bash -n /opt/coffee-passport/activate-domain.sh
install -m 644 /tmp/nginx-domain-http.conf /etc/nginx/sites-available/coffee-passport-domain
nginx -t
nginx -s reload
install -m 644 /tmp/coffee-passport-cert-renew.service /etc/systemd/system/coffee-passport-cert-renew.service
systemctl daemon-reload
systemctl enable --now coffee-passport-cert-renew.timer
systemctl start coffee-passport-cert-renew.service
systemctl show coffee-passport-cert-renew.service -p Result -p ExecMainStatus
curl --fail --silent --show-error https://147.45.102.186/ -o /dev/null
curl --silent --show-error -I -H Host:www.coffeepassport.ru http://127.0.0.1/verification?test=1
echo "BACKUP=$backup"
