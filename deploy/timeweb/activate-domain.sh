#!/bin/bash
# Run on Timeweb after the owner updates the apex A record.
set -euo pipefail
domain=coffeepassport.ru
ip=147.45.102.186
resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
if [ "$resolved" != "$ip" ]; then
    echo "DNS pending: $domain resolves to $resolved; expected $ip" >&2
    exit 2
fi
cert_domains=(-d "$domain")
export COFFEE_DOMAIN_WWW=0
www_resolved=$(getent ahostsv4 "www.$domain" | awk '{print $1}' | sort -u || true)
if [ "$www_resolved" = "$ip" ]; then
    cert_domains+=(-d "www.$domain")
    export COFFEE_DOMAIN_WWW=1
else
    echo "www DNS pending; activating apex only (www resolves to $www_resolved)"
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/coffee-passport/backups/domain-activation-$stamp
install -d -m 700 "$backup"
cp -a /etc/nginx "$backup/nginx"
cp -a /opt/coffee-passport/app/.next "$backup/next"
cp -a /opt/coffee-passport/app/.env.local "$backup/app.env"
cp -a /opt/coffee-passport/supabase/.env "$backup/supabase.env"
certbot() {
 docker run --rm --network host -v /etc/letsencrypt:/etc/letsencrypt -v /var/lib/letsencrypt:/var/lib/letsencrypt -v /var/log/letsencrypt:/var/log/letsencrypt -v /var/www/coffee-passport-acme:/var/www/coffee-passport-acme certbot/certbot:v5.4.0 "$@"
}
certbot certonly --webroot -w /var/www/coffee-passport-acme --non-interactive --agree-tos --register-unsafely-without-email --cert-name coffee-passport-domain --expand "${cert_domains[@]}"
python3 - <<'PY'
import os
from pathlib import Path
p=Path('/etc/nginx/sites-available/coffee-passport')
s=p.read_text()
s=s[s.index('server {'):].replace(' default_server','').replace('147.45.102.186','coffeepassport.ru').replace('coffee-passport-ip/','coffee-passport-domain/')
if os.environ['COFFEE_DOMAIN_WWW']=='1':
 s+='''
server {
    listen 80;
    server_name www.coffeepassport.ru;
    location /.well-known/acme-challenge/ { root /var/www/coffee-passport-acme; }
    location / { return 308 https://coffeepassport.ru$request_uri; }
}
server {
    listen 443 ssl;
    server_name www.coffeepassport.ru;
    ssl_certificate /etc/letsencrypt/live/coffee-passport-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/coffee-passport-domain/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 308 https://coffeepassport.ru$request_uri;
}
'''
Path('/etc/nginx/sites-available/coffee-passport-domain').write_text(s)
PY
nginx -t
nginx -s reload
curl --fail --silent --show-error "https://$domain/" -o /dev/null
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/coffee-passport/supabase/.env')
lines=p.read_text().splitlines()
updates={'SITE_URL':'https://coffeepassport.ru','API_EXTERNAL_URL':'https://coffeepassport.ru/supabase/auth/v1','SUPABASE_PUBLIC_URL':'https://coffeepassport.ru/supabase'}
for i,line in enumerate(lines):
 key,_,value=line.partition('=')
 if key in updates: lines[i]=key+'='+updates[key]
 if key=='ADDITIONAL_REDIRECT_URLS':
  urls=value.split(',')
  for url in ['https://coffeepassport.ru/auth/callback','https://coffeepassport.ru/auth/reset-password','https://147.45.102.186/auth/callback','https://147.45.102.186/auth/reset-password']:
   if url not in urls: urls.append(url)
  lines[i]=key+'='+','.join(urls)
p.write_text('\n'.join(lines)+'\n')
p=Path('/opt/coffee-passport/app/.env.local')
s=p.read_text().replace('NEXT_PUBLIC_SUPABASE_URL=https://147.45.102.186/supabase','NEXT_PUBLIC_SUPABASE_URL=https://coffeepassport.ru/supabase')
p.write_text(s)
PY
cd /opt/coffee-passport/supabase
docker compose up -d --no-deps auth
cd /opt/coffee-passport/app
npm run build
systemctl restart coffee-passport
sleep 5
curl --fail --silent --show-error "https://$domain/" -o /dev/null
curl --fail --silent --show-error https://147.45.102.186/ -o /dev/null
if [ "$COFFEE_DOMAIN_WWW" = 1 ]; then
    curl --fail --silent --show-error -I "https://www.$domain/"
fi
sed -i 's/ --cert-name coffee-passport-ip//' /etc/systemd/system/coffee-passport-cert-renew.service
systemctl daemon-reload
certbot renew --cert-name coffee-passport-domain --dry-run --no-random-sleep-on-renew
echo "Domain activated; backup: $backup. Browser acceptance checks still required."
